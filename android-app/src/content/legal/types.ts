export type LegalBlock = { kind: 'p'; text: string } | { kind: 'list'; items: string[] };

export type LegalPolicy = {
  title: string;
  pageTitle: string;
  effective: string;
  sections: { title: string; blocks: LegalBlock[] }[];
};
