interface CapsuleInput {
  readonly values: readonly number[];
  readonly label: string;
}

const input: CapsuleInput = {
  values: [1, 2, 3],
  label: "capsule-owned",
};

const output: { readonly sum: number; readonly label: string } = {
  sum: input.values.reduce((total: number, value: number): number => total + value, 0),
  label: input.label,
};

globalThis.__capsuleResult = output;
