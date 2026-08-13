# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import List

class MissingSkill(BaseModel):
    skill: str
    importance: str  # "High", "Medium", "Low"
    recommendation: str

class BulletImprovement(BaseModel):
    original_text: str
    improved_text: str
    reasoning: str

class MatchAnalysisResponse(BaseModel):
    overall_match_score: int  # 0 to 100
    summary: str
    matching_skills: List[str]
    missing_skills: List[MissingSkill]
    bullet_improvements: List[BulletImprovement]