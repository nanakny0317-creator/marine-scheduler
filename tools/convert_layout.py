#!/usr/bin/env python3
"""
Python レイアウト JSON (mm座標) → marine-scheduler FieldDef JSON 変換スクリプト

対応フォーマット:
  mm形式   : {"form":..., "page":..., "fields":[{x,y,w,h,snapped,...}]}
  twip形式 : {"source":..., "unit":"twip", "controls":[{type,L,T,W,H,...}]}

Usage:
  python tools/convert_layout.py <input.json> [--page N] [--out output.json]

例:
  python tools/convert_layout.py C:/path/to/shiken.json --page 1 --out public/form-layouts/shiken.json
  python tools/convert_layout.py C:/path/to/menkyo.json --page 1 --out public/form-layouts/menkyo.json
"""
import json, sys, re, argparse
from pathlib import Path

# marine-scheduler の PDF 仕様定数（FormCalibrationPage.tsx と同一）
PDF_W = 592.56
PDF_H = 842.4
A4_W  = 210.0   # mm
A4_H  = 297.0   # mm

MM2PTX = PDF_W / A4_W   # ≈ 2.822  mm → pt (X方向)
MM2PTY = PDF_H / A4_H   # ≈ 2.836  mm → pt (Y方向)
T2MM   = 25.4 / 1440    # twip → mm

# VB6 コントロール名 → marine-scheduler キー 対応表
CTL_TO_KEY: dict = {
    'txt住所':      'address1',
    'txt住所1':     'address1',
    'txt住所2':     'address2',
    'txtフリガナ':  'last_kana',
    'txt氏名':      'last_name',
    'txt氏名カナ':  'last_kana',
    'txt生年月日':  'birth_date',
    'txt郵便番号':  'postal_code',
    'txt電話':      'phone',
    'txt電話番号':  'phone',
    'txt携帯':      'mobile',
    'txt試験名':    'exam_location',
    'txt試験地':    'exam_location',
    'txt試験日':    'exam_date',
    'txt性別':      'gender',
    'txt本籍':      'domicile_pref',
    'txt国籍':      'nationality',
}

def to_pt_x(x_mm: float) -> float:
    return round(x_mm * MM2PTX, 2)

def to_pt_y(y_mm: float) -> float:
    """mm (上原点・下向き) → PDF pt (下原点・上向き)"""
    return round((A4_H - y_mm) * MM2PTY, 2)

_id_counter = 0
def next_id() -> str:
    global _id_counter
    _id_counter += 1
    return f"cvt{_id_counter:04d}"

def ctl_to_key(ctl: str) -> str:
    if ctl in CTL_TO_KEY:
        return CTL_TO_KEY[ctl]
    base = re.sub(r'^(txt|chk|lbl|cmb)', '', ctl)
    return base or ctl

def series_prefix(field_name: str) -> str:
    """フィールド名末尾の 英字+数字 or 数字 を取り除いた共通プレフィックス"""
    return re.sub(r'[A-Za-z]?\d+$', '', field_name)

def convert_mm_format(fields_raw: list, target_page: int) -> list:
    """
    mm形式フィールドリスト → FieldDef[] へ変換

    snapped=True (OCRマス目) → chars でグループ化
    snapped=False, w>20mm   → text
    snapped=False, w<=20mm  → chars
    """
    output = []

    # snapped フィールドをグループ化（OCRマス目セル）
    snapped = [f for f in fields_raw if f.get('snapped') and f['w'] < 15 and f['h'] < 15]
    others  = [f for f in fields_raw if not (f.get('snapped') and f['w'] < 15 and f['h'] < 15)]

    groups: dict = {}
    for f in snapped:
        prefix   = series_prefix(f['field'])
        y_bucket = round(f['y'] / 1.5)   # 1.5mm 単位でグループ
        groups.setdefault((prefix, y_bucket), []).append(f)

    for group in groups.values():
        group.sort(key=lambda f: f['x'])
        first  = group[0]
        second = group[1] if len(group) > 1 else None

        char_width_pt = to_pt_x(second['x'] - first['x']) if second else to_pt_x(first['w'])
        y_pt = to_pt_y(first['y'] + first['h'])   # セル下端 → PDF pt

        ctl_base = re.sub(r'\d+$', '', first.get('ctl', ''))
        output.append({
            "id":        next_id(),
            "key":       ctl_to_key(ctl_base) if ctl_base else series_prefix(first['field']).strip('_').strip(),
            "label":     series_prefix(first['field']).strip('_').strip(),
            "page":      target_page,
            "type":      "chars",
            "x":         to_pt_x(first['x']),
            "y":         y_pt,
            "charWidth": char_width_pt,
            "maxChars":  len(group),
            "fontSize":  7,
        })

    # snapped でないフィールド
    for f in others:
        x_pt = to_pt_x(f['x'])
        y_pt = to_pt_y(f['y'] + f['h'])
        key  = ctl_to_key(f.get('ctl', ''))

        if f['w'] > 20:
            output.append({
                "id":      next_id(),
                "key":     key,
                "label":   f['field'],
                "page":    target_page,
                "type":    "text",
                "x":       x_pt,
                "y":       y_pt,
                "width":   to_pt_x(f['w']),
                "fontSize": 7,
            })
        else:
            max_chars = max(1, round(f['w'] / 2.5))
            output.append({
                "id":        next_id(),
                "key":       key,
                "label":     f['field'],
                "page":      target_page,
                "type":      "chars",
                "x":         x_pt,
                "y":         y_pt,
                "charWidth": to_pt_x(f['w'] / max_chars),
                "maxChars":  max_chars,
                "fontSize":  7,
            })

    output.sort(key=lambda f: -f['y'])
    return output


def convert_twip_format(controls: list, target_page: int) -> list:
    """twip形式コントロールリスト → FieldDef[]"""
    output = []
    for c in controls:
        if c.get('type') not in ('TextBox',):
            continue
        x_mm = c['L'] * T2MM
        y_mm = c['T'] * T2MM
        w_mm = c['W'] * T2MM
        h_mm = c['H'] * T2MM
        key   = ctl_to_key(c.get('name', ''))
        label = c.get('text', '') or c.get('name', '')
        x_pt  = to_pt_x(x_mm)
        y_pt  = to_pt_y(y_mm + h_mm)

        if w_mm > 20:
            output.append({
                "id":      next_id(),
                "key":     key,
                "label":   label,
                "page":    target_page,
                "type":    "text",
                "x":       x_pt,
                "y":       y_pt,
                "width":   to_pt_x(w_mm),
                "fontSize": 7,
            })
        else:
            max_chars = max(1, round(w_mm / 2.5))
            output.append({
                "id":        next_id(),
                "key":       key,
                "label":     label,
                "page":      target_page,
                "type":      "chars",
                "x":         x_pt,
                "y":         y_pt,
                "charWidth": to_pt_x(w_mm / max_chars),
                "maxChars":  max_chars,
                "fontSize":  7,
            })

    output.sort(key=lambda f: -f['y'])
    return output


def convert(input_path: str, target_page: int, out_path: str = None):
    global _id_counter
    _id_counter = 0

    src = Path(input_path)
    with src.open(encoding='utf-8') as fp:
        data = json.load(fp)

    if 'fields' in data:
        result = convert_mm_format(data['fields'], target_page)
        fmt    = 'mm'
    elif 'controls' in data:
        result = convert_twip_format(data['controls'], target_page)
        fmt    = 'twip'
    else:
        print(f'ERROR: 未対応フォーマット ({list(data.keys())[:4]})', file=sys.stderr)
        return

    dst = Path(out_path) if out_path else src.with_name(src.stem + '_converted.json')
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open('w', encoding='utf-8') as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)

    print(f'[{fmt}] {src.name} → {dst}  ({len(result)} fields, page={target_page})')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Python layout JSON → marine-scheduler FieldDef JSON')
    ap.add_argument('input',       help='入力 JSON（mm形式 or twip形式）')
    ap.add_argument('--page', '-p', type=int, default=1,
                    help='割り当て marine-scheduler ページ番号 (デフォルト: 1)')
    ap.add_argument('--out',  '-o', help='出力ファイルパス')
    args = ap.parse_args()
    convert(args.input, args.page, args.out)
