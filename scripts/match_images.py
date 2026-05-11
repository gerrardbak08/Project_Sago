"""
사고 사례 ↔ 이미지 매칭 스크립트

이미지 파일명의 키워드와 사고 사례 텍스트를 TF-IDF 코사인 유사도로 매칭하여
processed/incidents_cust.csv, processed/incidents_emp.csv에 image_url 컬럼을 추가한다.
"""

import os
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def load_image_data(images_dir: str = "images") -> pd.DataFrame:
    """이미지 파일명에서 키워드를 추출한다."""
    image_files = [f for f in os.listdir(images_dir) if f.endswith('.png') and not f.startswith('.')]

    image_data = []
    for fname in sorted(image_files):
        name = fname.replace('.png', '').replace('_수정', '').replace('_개선', '')
        parts = name.split('_', 1)
        keywords = parts[1] if len(parts) > 1 else ""
        text = keywords.replace('_', ' ')
        image_data.append({
            "filename": fname,
            "keywords_text": text,
            "url": f"images/{fname}",
        })

    return pd.DataFrame(image_data)


def match_images(incidents_texts: list[str], image_df: pd.DataFrame) -> tuple[list[str], np.ndarray]:
    """사고 내용과 이미지 키워드를 TF-IDF 코사인 유사도로 매칭."""
    all_texts = incidents_texts + list(image_df["keywords_text"].values)

    vectorizer = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 4))
    tfidf_matrix = vectorizer.fit_transform(all_texts)

    n_incidents = len(incidents_texts)

    incident_vectors = tfidf_matrix[:n_incidents]
    image_vectors = tfidf_matrix[n_incidents:]

    sim_matrix = cosine_similarity(incident_vectors, image_vectors)

    best_indices = np.argmax(sim_matrix, axis=1)
    best_scores = np.max(sim_matrix, axis=1)

    urls = []
    for best_img_idx, score in zip(best_indices, best_scores):
        if score > 0.05:
            urls.append(image_df.iloc[best_img_idx]["url"])
        else:
            urls.append("")

    return urls, best_scores


def main():
    image_df = load_image_data()
    print(f"이미지: {len(image_df)}개")

    # CUST
    cust_df = pd.read_csv("processed/incidents_cust.csv")
    cust_texts = cust_df["사고내용요약"].fillna("").tolist()
    cust_urls, cust_scores = match_images(cust_texts, image_df)
    cust_df["image_url"] = cust_urls

    print(f"\n=== CUST 매칭 결과 ===")
    print(f"매칭 성공: {sum(1 for u in cust_urls if u)}/{len(cust_df)}")
    print(f"평균 유사도: {cust_scores.mean():.3f}")
    for i in range(min(5, len(cust_df))):
        if cust_urls[i]:
            print(f"  {cust_df.iloc[i]['incident_id']} | {cust_texts[i][:35]}... → {cust_urls[i]}")

    # EMP
    emp_df = pd.read_csv("processed/incidents_emp.csv")
    emp_texts = emp_df["사고 내용"].fillna("").tolist()
    emp_urls, emp_scores = match_images(emp_texts, image_df)
    emp_df["image_url"] = emp_urls

    print(f"\n=== EMP 매칭 결과 ===")
    print(f"매칭 성공: {sum(1 for u in emp_urls if u)}/{len(emp_df)}")
    print(f"평균 유사도: {emp_scores.mean():.3f}")
    for i in range(min(5, len(emp_df))):
        if emp_urls[i]:
            print(f"  {emp_df.iloc[i]['incident_id']} | {emp_texts[i][:35]}... → {emp_urls[i]}")

    # 저장
    cust_df.to_csv("processed/incidents_cust.csv", index=False)
    emp_df.to_csv("processed/incidents_emp.csv", index=False)
    print(f"\n✅ CSV 저장 완료")


if __name__ == "__main__":
    main()
