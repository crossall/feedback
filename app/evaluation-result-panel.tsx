"use client";

import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import type { Evaluation } from "@/lib/evaluation-result";

export default function EvaluationResultPanel({
  result,
  studentName,
}: {
  result: Evaluation;
  studentName: string;
}) {
  return (
    <section className="result-panel">
      <div className="result-top">
        <div>
          <span className="result-label">AI REVIEW COMPLETE</span>
          <h2>{studentName} 학생의 피드백</h2>
          <p>{result.summary}</p>
        </div>
        <div className="score-ring">
          <strong>{result.totalScore}</strong>
          <span>/ {result.maxScore}</span>
        </div>
      </div>
      <div className="criteria-grid">
        {result.criteria.map((item, index) => (
          <article key={`${item.name}-${index}`}>
            <div className="criterion-head">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.name}</h3>
              <b>{item.score} / {item.maxScore}</b>
            </div>
            <div className="score-bar">
              <i style={{ width: `${Math.min(100, (item.score / item.maxScore) * 100)}%` }} />
            </div>
            <p>{item.feedback}</p>
          </article>
        ))}
      </div>
      <div className="feedback-columns">
        <div>
          <h3>잘한 점</h3>
          {result.strengths.map((text) => <p key={text}><Check size={17} />{text}</p>)}
        </div>
        <div>
          <h3>다듬으면 더 좋아질 점</h3>
          {result.improvements.map((text) => <p key={text}><ArrowUpRight size={17} />{text}</p>)}
        </div>
      </div>
      <div className="next-step">
        <span><Sparkles size={20} /></span>
        <div><small>NEXT STEP</small><strong>{result.nextStep}</strong></div>
      </div>
    </section>
  );
}
