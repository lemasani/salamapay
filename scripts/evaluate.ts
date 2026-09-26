import { buildScenarios, evaluate } from "@/lib/risk/evaluation";

const report = evaluate(buildScenarios());
console.log("Synthetic evaluation (NOT real-world accuracy):");
console.log(JSON.stringify(report, null, 2));
