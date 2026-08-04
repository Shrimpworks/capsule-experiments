const input = {
  values: [1, 2, 3],
  label: "capsule-owned",
};
console.log(
  JSON.stringify({
    count: input.values.length,
    label: input.label,
    sum: input.values.reduce((total, value) => total + value, 0),
  }),
);
