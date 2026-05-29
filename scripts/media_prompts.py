"""
사고유형별 안전 이미지 생성 프롬프트 템플릿.

각 항목은 Bedrock Nova Canvas 의 textToImageParams.text 로 전달된다.
- 1024x1024, 한국 다이소 매장 분위기, 사실적 일러스트 톤
- 사람 얼굴은 식별 불가능하게(측면/뒤모습), 텍스트는 출력하지 않음
"""

from __future__ import annotations

# (source, accident_type) → 프롬프트
PROMPTS: dict[tuple[str, str], str] = {
    # ── 고객 안전 (CUST) ──
    ("cust", "낙상"): (
        "A retail store aisle with wet floor warning sign, customer slipping risk. "
        "Korean Daiso-style store interior, bright fluorescent lighting, "
        "polished tile floor with subtle water reflection. "
        "Photorealistic safety poster style, no people faces visible, no text. "
        "Safety theme: caution, slip and fall prevention."
    ),
    ("cust", "재물"): (
        "Retail store shelving with merchandise falling hazard, properly secured products versus loose stacked items. "
        "Korean Daiso-style store interior, organized aisles. "
        "Photorealistic safety poster style, no text overlay. "
        "Safety theme: falling object prevention."
    ),
    ("cust", "충돌"): (
        "Retail store corner with mirror at intersection, two shopping carts about to collide. "
        "Korean Daiso-style store interior. Photorealistic safety poster style, no people faces visible, no text. "
        "Safety theme: corner collision prevention."
    ),
    ("cust", "자상"): (
        "Sharp display hook hazard in retail store, padded protective cap on metal hook. "
        "Korean Daiso-style store interior, close-up view. Photorealistic, no text. "
        "Safety theme: laceration prevention from sharp fixtures."
    ),
    ("cust", "클레임"): (
        "Customer service desk in Korean retail store, professional staff handling complaint calmly. "
        "Bright, modern setting. Photorealistic safety poster style, no text, no identifiable faces. "
        "Safety theme: customer service de-escalation."
    ),
    # ── 직원 안전 (EMP) ──
    ("emp", "넘어짐"): (
        "Store employee carrying box, properly using non-slip shoes on clean floor versus tripping hazard. "
        "Korean Daiso back-of-store area. Photorealistic safety poster style, no faces, no text. "
        "Safety theme: trip and fall prevention for staff."
    ),
    ("emp", "무리한 동작"): (
        "Warehouse worker demonstrating correct lifting posture, bent knees, straight back, lifting box. "
        "Korean retail back room. Photorealistic safety poster style, no text overlay. "
        "Safety theme: ergonomic lifting and back injury prevention."
    ),
    ("emp", "물체에 맞음"): (
        "Stockroom with high shelving, hard hat on worker, secured boxes versus unstable stack. "
        "Korean retail warehouse area. Photorealistic safety poster style, no faces, no text. "
        "Safety theme: struck-by-object prevention."
    ),
    ("emp", "베임"): (
        "Box cutter being used with cut-resistant gloves, retracted blade safely stored. "
        "Close-up view on workbench, Korean retail back room. Photorealistic, no text. "
        "Safety theme: laceration prevention from cutting tools."
    ),
    ("emp", "부딪힘"): (
        "Narrow stockroom aisle with proper signage and lighting, worker navigating carefully. "
        "Korean retail back-of-store. Photorealistic safety poster style, no faces, no text. "
        "Safety theme: bump and collision prevention."
    ),
    ("emp", "떨어짐"): (
        "Step ladder being used correctly with three-point contact, versus unsafe chair stack. "
        "Korean retail stockroom. Photorealistic safety poster style, no faces, no text. "
        "Safety theme: fall from height prevention."
    ),
    ("emp", "끼임"): (
        "Pallet jack and roller cage with hand placement warning markers, gloved hands held safely away. "
        "Korean retail loading area. Photorealistic safety poster style, no faces, no text. "
        "Safety theme: pinch point and crush prevention."
    ),
    ("emp", "깔림"): (
        "Stable pallet stack with proper banding versus unstable leaning pallets. "
        "Korean retail warehouse, cautionary mood. Photorealistic safety poster style, no text. "
        "Safety theme: crush-by-toppling prevention."
    ),
    ("emp", "기타"): (
        "Korean retail back room with general safety signage, first aid kit, fire extinguisher visible. "
        "Photorealistic safety poster style, no text. "
        "Safety theme: general workplace safety awareness."
    ),
    ("emp", "질병"): (
        "Korean retail break room with handwashing station, hydration reminder, comfortable seating. "
        "Photorealistic, no faces, no text. "
        "Safety theme: worker health and wellbeing."
    ),
}


def get_prompt(source: str, accident_type: str) -> str | None:
    return PROMPTS.get((source, accident_type))


# 사진 생성 대상 (이 목록만 처리)
TARGETS = list(PROMPTS.keys())
