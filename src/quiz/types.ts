export type Difficulty = 'easy' | 'hard';

export interface QuizScope {
  subjects: 'regions' | 'grapes' | 'both';
  /** Limit cards to one country, or null for all. */
  country: string | null;
  difficulty: Difficulty;
}

export interface SubjectRef {
  kind: 'region' | 'grape';
  slug: string;
}

export type TemplateId =
  | 'region-country'
  | 'region-grape'
  | 'grape-region'
  | 'grape-synonym'
  | 'grape-structure'
  | 'grape-origin'
  | 'grape-aroma';

export interface Card {
  /** Unique per question and answer; used to avoid repeats within and across rounds. */
  id: string;
  /** Template and subject, e.g. "region-country|region:barolo"; used to bring missed cards back. */
  key: string;
  template: TemplateId;
  subject: SubjectRef;
  subjectName: string;
  /** Contains one "___" where the answer goes. */
  statement: string;
  /** Always three distinct options. */
  options: string[];
  /** Index of the correct option. */
  answer: number;
  explanation: string;
  /** Region to fly to once the answer is revealed. */
  flyTo?: string;
  /** Regions to light up once the answer is revealed. */
  highlight?: string[];
}
