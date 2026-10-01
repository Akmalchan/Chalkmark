import { LectureVisual } from "../lecture-visual";
import { visualExamples } from "@/lib/visual-examples";

export default function VisualCheck() {
  return <main className="notes-document">
    <a href="/">← Back to Chalkmark</a>
    <h1>Drawing examples</h1>
    <p className="document-summary">These are controlled renderer examples, not generated results from your lecture. They show the drawing details the new format can preserve.</p>
    {visualExamples.map((visual,i)=><LectureVisual key={i} visual={visual}/>)}
  </main>;
}
