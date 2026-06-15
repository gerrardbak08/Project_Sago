#!/usr/bin/env python3
"""
sample_fall_lottie.py — 낙상 Lottie(JSON 벡터 애니메이션) 샘플 생성기

전신을 발(230,330) 기준 회전시키는 단일 shape 레이어 + 하강 화살표 레이어.
lottie-web으로 60fps 재생. 색상·속도는 키프레임으로 제어.
"""
import json
import os

W = H = 480
FR = 24
DUR = 58  # 프레임 (~2.4초)
NAVY = [0.102, 0.102, 0.180, 1]   # #1a1a2e
RED = [0.902, 0.224, 0.275, 1]    # #e63946
YELLOW = [0.957, 0.769, 0.188, 1] # #f4c430
OUT = os.path.join(os.path.dirname(__file__), "out", "pictogram_samples")
os.makedirs(OUT, exist_ok=True)


def stroke(color, w):
    return {"ty": "st", "c": {"a": 0, "k": color}, "o": {"a": 0, "k": 100},
            "w": {"a": 0, "k": w}, "lc": 2, "lj": 2}


def fill(color):
    return {"ty": "fl", "c": {"a": 0, "k": color}, "o": {"a": 0, "k": 100}}


def path_line(x1, y1, x2, y2):
    return {"ty": "sh", "ks": {"a": 0, "k": {
        "i": [[0, 0], [0, 0]], "o": [[0, 0], [0, 0]],
        "v": [[x1, y1], [x2, y2]], "c": False}}}


def ellipse(cx, cy, r):
    return {"ty": "el", "p": {"a": 0, "k": [cx, cy]}, "s": {"a": 0, "k": [r * 2, r * 2]}}


def group(items):
    return {"ty": "gr", "it": items + [
        {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]},
         "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}}]}


def line_group(x1, y1, x2, y2, color, w):
    return group([path_line(x1, y1, x2, y2), stroke(color, w)])


def circle_group(cx, cy, r, color):
    return group([ellipse(cx, cy, r), fill(color)])


# 전신 shapes (직립 자세)
body_shapes = [
    line_group(230, 220, 200, 330, NAVY, 12),  # 왼다리
    line_group(230, 220, 255, 330, NAVY, 12),  # 오른다리
    line_group(230, 220, 230, 140, NAVY, 13),  # 몸통
    line_group(230, 140, 175, 158, NAVY, 11),  # 왼팔
    line_group(230, 140, 282, 162, NAVY, 11),  # 오른팔
    circle_group(230, 113, 27, NAVY),          # 머리
]

# 회전 키프레임 (CSS와 동일 타이밍): 0~12% 0도, 55% 82도, 80% hold, 100% 0
rot_keys = [
    {"t": 0,                "s": [0],  "i": {"x": [0.45], "y": [1]}, "o": {"x": [0.55], "y": [0]}},
    {"t": int(DUR * 0.12),  "s": [0],  "i": {"x": [0.45], "y": [1]}, "o": {"x": [0.55], "y": [0]}},
    {"t": int(DUR * 0.55),  "s": [82], "i": {"x": [0.45], "y": [1]}, "o": {"x": [0.55], "y": [0]}},
    {"t": int(DUR * 0.80),  "s": [82], "i": {"x": [0.45], "y": [1]}, "o": {"x": [0.55], "y": [0]}},
    {"t": DUR,              "s": [0]},
]

body_layer = {
    "ty": 4, "nm": "body", "ip": 0, "op": DUR + 12, "st": 0, "sr": 1, "bm": 0,
    "ks": {
        "a": {"a": 0, "k": [230, 330]},   # 앵커 = 발 피벗
        "p": {"a": 0, "k": [230, 330]},
        "s": {"a": 0, "k": [100, 100]},
        "o": {"a": 0, "k": 100},
        "r": {"a": 1, "k": rot_keys},
    },
    "shapes": body_shapes,
}

# 하강 화살표 (페이드 + 이동)
arrow_shapes = [
    line_group(360, 150, 360, 250, RED, 7),
    group([{"ty": "sh", "ks": {"a": 0, "k": {
        "i": [[0, 0], [0, 0], [0, 0]], "o": [[0, 0], [0, 0], [0, 0]],
        "v": [[352, 250], [368, 250], [360, 266]], "c": True}}}, fill(RED)]),
]
arrow_layer = {
    "ty": 4, "nm": "arrow", "ip": 0, "op": DUR + 12, "st": 0, "sr": 1, "bm": 0,
    "ks": {
        "a": {"a": 0, "k": [360, 200]},
        "p": {"a": 1, "k": [
            {"t": int(DUR * 0.12), "s": [360, 200], "i": {"x": 0.4, "y": 1}, "o": {"x": 0.6, "y": 0}},
            {"t": int(DUR * 0.45), "s": [360, 290]},
            {"t": int(DUR * 0.80), "s": [360, 290]},
        ]},
        "s": {"a": 0, "k": [100, 100]},
        "o": {"a": 1, "k": [
            {"t": int(DUR * 0.12), "s": [0]},
            {"t": int(DUR * 0.30), "s": [100]},
            {"t": int(DUR * 0.80), "s": [100]},
            {"t": DUR, "s": [0]},
        ]},
        "r": {"a": 0, "k": 0},
    },
    "shapes": arrow_shapes,
}

# 바닥
ground_layer = {
    "ty": 4, "nm": "ground", "ip": 0, "op": DUR + 12, "st": 0, "sr": 1, "bm": 0,
    "ks": {"a": {"a": 0, "k": [0, 0]}, "p": {"a": 0, "k": [0, 0]},
           "s": {"a": 0, "k": [100, 100]}, "o": {"a": 0, "k": 100}, "r": {"a": 0, "k": 0}},
    "shapes": [line_group(70, 330, 410, 330, YELLOW, 10)],
}

anim = {
    "v": "5.7.0", "fr": FR, "ip": 0, "op": DUR + 12, "w": W, "h": H, "nm": "fall", "ddd": 0,
    "assets": [],
    # 레이어는 위에서부터 그려짐 → 화살표/몸통/바닥 순서 주의 (먼저 나온게 위)
    "layers": [arrow_layer, body_layer, ground_layer],
}

out = os.path.join(OUT, "fall_lottie.json")
with open(out, "w") as fp:
    json.dump(anim, fp, separators=(",", ":"))
print(f"Lottie 생성: {out} ({os.path.getsize(out)} bytes)")
