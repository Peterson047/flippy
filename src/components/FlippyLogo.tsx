
export default function FlippyLogo() {
  // text-2xl font-size is 1.5rem (24px), line-height is 2rem (32px).
  // We'll aim for the SVG to roughly match this size.
  const svgHeight = 32; // px, matching 2rem line-height
  const fontSize = 24;  // px, matching 1.5rem font-size
  
  // Approximate width for "Flippy" in Poppins Bold @ 24px.
  // This value might need fine-tuning for perfect visual balance.
  const svgWidth = 100; 

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      aria-label="Flippy Logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        fontFamily="Poppins, sans-serif" // Use Poppins font, as defined in font-headline
        fontWeight="900"                // Explicitly use bold weight 900
        fontSize={fontSize}             // Font size in px
        fill="hsl(var(--foreground))"   // Use theme's foreground color (white in dark theme)
        x="50%"                         // Center text horizontally
        y="50%"                         // Center text vertically
        dominantBaseline="middle"       // Vertical alignment for centering
        textAnchor="middle"             // Horizontal alignment for centering
      >
        Flippy
      </text>
    </svg>
  );
}
