import { prefixProblem } from "./pieceCodes";

export default function CodePreview({ prefix, code }) {
  const problem = prefixProblem(prefix);
  if (problem) return <div className="form-text text-danger">{problem}</div>;
  if (!code) return null;
  return <div className="form-text">Va a quedar {code}</div>;
}
