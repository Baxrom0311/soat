// Inline SVGs mirroring the icon set from the original static dashboard.
type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function LogoIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} className={props.className}>
      <path d="M3 12h4l2 6 4-14 2 8h6" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M15 17l5-5-5-5M20 12H9M12 19H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10 13l8-8M15.5 7.5l2 2M18 5l2 2" />
    </svg>
  );
}

export function CallsIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function DevicesIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M6 3v3M12 3v3M18 3v3M6 18v3M12 18v3M18 18v3M3 6h3M3 12h3M3 18h3M18 6h3M18 12h3M18 18h3" />
    </svg>
  );
}

export function RoomsIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M5 21h12M17 21h2M13 12h.01" />
    </svg>
  );
}

export function UnassignedIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M4.9 4.9a10 10 0 1 0 14.2 14.2A10 10 0 0 0 4.9 4.9Z" />
      <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.7" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

export function StaffIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function PlanIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M20 12V7a2 2 0 0 0-2-2h-5L3 12l7 7 10-7z" />
      <circle cx="9" cy="9" r="1.4" />
    </svg>
  );
}

export function OverviewIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function ClinicIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M3 21h18M5 21V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14" />
      <path d="M12 8.5v4M10 10.5h4M9.5 21v-3.5h5V21" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function HamburgerIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function CollapseIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M15 6l-6 6 6 6" />
      <path d="M4 4v16" />
    </svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M3 12h4l2 3h6l2-3h4" />
      <path d="M5.5 5h13l2.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2.5-7Z" />
    </svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <svg {...base} className={props.className}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}
