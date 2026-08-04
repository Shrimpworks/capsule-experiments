                        
                                     
                         
 

const input               = {
  values: [1, 2, 3],
  label: "capsule-owned",
};

const output                                                   = {
  sum: input.values.reduce((total        , value        )         => total + value, 0),
  label: input.label,
};

globalThis.__capsuleResult = output;
