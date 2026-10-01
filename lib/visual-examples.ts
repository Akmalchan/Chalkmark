import type { LectureDocument } from "./lecture-schema";
type Visual = NonNullable<LectureDocument["sections"][number]["visual"]>;
const base = { nodes:[], edges:[], table:null, sourceTimestampSeconds:null, uncertainty:"Renderer example with illustrative coordinates. This is not an extraction from the linked lecture." };

export const visualExamples: Visual[] = [
  {
    ...base, kind:"coordinate_graph", title:"A curve and its secant construction", fidelity:"formula_based",
    description:"A computed parabola with a secant line and a labeled rise/run triangle. The numerical example uses x = 1 and x = 2.",
    panels:[{
      title:"Average slope on y = x²", xLabel:"x", yLabel:"y", xMin:0, xMax:2.5, yMin:0, yMax:6.5,
      xTicks:[], yTicks:[],
      series:[{label:"y = x²",expression:"x^2",points:[],style:"solid"}],
      annotations:[
        {kind:"line",points:[{x:0.7,y:0.1},{x:2.5,y:5.5}],label:"Secant",labelPosition:{x:2.15,y:5.1},dashed:true},
        {kind:"polygon",points:[{x:1,y:1},{x:2,y:1},{x:2,y:4}],label:"",labelPosition:null,dashed:false},
        {kind:"label",points:[{x:1.5,y:0.65}],label:"Δx = 1",labelPosition:null,dashed:false},
        {kind:"label",points:[{x:2.22,y:2.5}],label:"Δy = 3",labelPosition:null,dashed:false},
        {kind:"point",points:[{x:1,y:1}],label:"A",labelPosition:{x:0.85,y:1.2},dashed:false},
        {kind:"point",points:[{x:2,y:4}],label:"B",labelPosition:{x:1.85,y:4.4},dashed:false},
      ],
    }],
  },
  {
    ...base, kind:"coordinate_graph",title:"Function and derivative stay separate",fidelity:"formula_based",
    description:"Two computed panels preserve the distinction between a function and its slope. A horizontal tangent marks the sine maximum.",
    panels:["sin","cos"].map(fn=>({
      title:fn==="sin"?"Function: y = sin x":"Slope: dy/dx = cos x",xLabel:"x (radians)",yLabel:fn==="sin"?"Height":"Slope",xMin:0,xMax:Math.PI*2,yMin:-1.3,yMax:1.3,
      xTicks:[{value:0,label:"0"},{value:Math.PI/2,label:"π/2"},{value:Math.PI,label:"π"},{value:Math.PI*1.5,label:"3π/2"},{value:Math.PI*2,label:"2π"}],yTicks:[{value:-1,label:"−1"},{value:0,label:"0"},{value:1,label:"1"}],
      series:[{label:`y = ${fn} x`,expression:`${fn}(x)`,points:[],style:"solid" as const}],
      annotations:fn==="sin"?[{kind:"line" as const,points:[{x:0.7,y:1},{x:2.4,y:1}],label:"Slope = 0",labelPosition:{x:Math.PI/2,y:1.1},dashed:true}]:[],
    })),
  },
  {
    ...base,kind:"table",title:"A readable comparison table",fidelity:"formula_based",description:"Paired formulas are laid out as a table with properly typeset mathematics.",panels:[],
    table:{columns:["Function","Derivative"],rows:[["$x^n$","$nx^{n-1}$"],["$\\sin x$","$\\cos x$"],["$e^x$","$e^x$"]]},
  },
  {
    ...base,kind:"concept_diagram",title:"Labels wrap instead of disappearing",fidelity:"qualitative",description:"Relationship labels remain readable, and arrows meet the edges of the boxes.",panels:[],
    nodes:[{id:"function",label:"Distance f(t) / Height y(x)",x:0,y:50},{id:"derivative",label:"Speed df/dt / Slope dy/dx",x:100,y:50}],
    edges:[{from:"function",to:"derivative",label:"Derivative"}],
  },
];
