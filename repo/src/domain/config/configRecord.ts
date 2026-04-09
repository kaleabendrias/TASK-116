export interface ConfigRecord {
  id: string;
  name: string;
  device: string;
  department: string;
  project: string;
  sampleQueue: string;
  sampleType: string;
  tags: string[];
  effectiveFrom: string; // MM/DD/YYYY
  effectiveTo: string;   // MM/DD/YYYY
  priceUsd: number;
  valid: boolean;
}

export type ConfigRecordPatch = Partial<Omit<ConfigRecord, 'id'>>;
