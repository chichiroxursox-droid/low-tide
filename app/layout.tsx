import type { Metadata } from "next";
import { Big_Shoulders_Stencil, Atkinson_Hyperlegible_Next, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const stencil = Big_Shoulders_Stencil({ variable: "--font-big-shoulders", subsets: ["latin"], axes: ["opsz"] });
const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "Low Tide",
  description: "Check whether a brand is sustainable, for the planet and the people who make its products, or check a green product claim against the FTC Green Guides, with every quote verified.",
};

// The design contract for this surface. It rides in the built HTML so the finish review can audit the render against it.
const CONTRACT = `
THESIS: Low Tide is the lifeguard's conditions board. The verdict flies as a beach flag and the tide goes out as a live check runs, revealing the evidence. It refuses the eco scorecard of rounded cards and rating badges.
OWN-WORLD: rescue-red painted board, white board rows ruled in deep-water ink, stencil caps, flag cloth in yellow, green and red, a red and white tide staff; verbatim quotes in a reading serif under a yellow highlight.
STORY: a judge sees a claim or a brand checked, reads the exact passage behind every mark, and watches a tampered quote get pulled.
FIRST VIEWPORT: full-width red board with LOW TIDE in white stencil caps and one plain line, claim and brand tabs cut into its lower edge, the white entry strip with the red CHECK plaque, sample plaques below.
FORM: grounded list, candidate 3 of 7, lifeguard board; seed dd8c1e80.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${stencil.variable} ${atkinson.variable} ${sourceSerif.variable} font-sans antialiased`}>
        <div hidden dangerouslySetInnerHTML={{ __html: `<!--${CONTRACT}-->` }} />
        {children}
      </body>
    </html>
  );
}
