// Placeholder platform marks drawn for this site (NOT official logos). Replace the body of a mark with the
// approved logo file once the owner supplies it. Colour + initial only; the accessible name lives on the button.
const marks = {
  gofood: { fill: "#8f2219", letter: "G" },
  grabfood: { fill: "#1f6b3a", letter: "G" },
  shopeefood: { fill: "#a3480f", letter: "S" },
};
const PlatformIcon = ({ platform, className = "size-10" }) => {
  const mark = marks[platform] ?? { fill: "#25251f", letter: "?" };
  return <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
    <circle cx="20" cy="20" r="20" fill={mark.fill} />
    <text x="20" y="27" textAnchor="middle" fontSize="20" fontWeight="700" fill="#ffffff" fontFamily="sans-serif">{mark.letter}</text>
  </svg>;
};
export default PlatformIcon;
