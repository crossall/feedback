import type { EvaluationOutputOptions } from "./class-config";

export type Evaluation = {
  title: string;
  totalScore: number;
  maxScore: number;
  summary: string;
  criteria: Array<{
    name: string;
    score: number;
    maxScore: number;
    feedback: string;
  }>;
  strengths: string[];
  improvements: string[];
  nextStep: string;
};

export type EvaluationResponse = Evaluation & {
  outputOptions: EvaluationOutputOptions;
  delivery?: {
    googleDocsAppended?: boolean;
    warning?: string;
  };
};
