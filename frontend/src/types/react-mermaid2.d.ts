declare module "react-mermaid2" {
  import { FC } from "react";
  interface MermaidProps {
    chart: string;
    config?: Record<string, unknown>;
  }
  const Mermaid: FC<MermaidProps>;
  export default Mermaid;
}
