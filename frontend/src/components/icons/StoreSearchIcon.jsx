import { useId } from 'react';

/** A shop front with a magnifying glass over its corner: "look for this build at other stores". */
export default function StoreSearchIcon({ size = 24, strokeWidth = 1.75, className = '', ...rest }) {
  const maskId = useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <mask id={maskId}>
        <rect width="24" height="24" fill="#fff" />
        <circle cx="16.5" cy="16.5" r="6.4" fill="#000" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path d="M2.5 9.5 4.5 3.5h13l2 6z" />
        <path d="M4 9.5V20.5h15V9.5" />
        <path d="M8 20.5v-5.5h3.5v5.5" />
      </g>
      <circle cx="16.5" cy="16.5" r="4.2" />
      <path d="m19.6 19.6 2.4 2.4" />
    </svg>
  );
}
