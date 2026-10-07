import React from 'react';
export declare function Modal({ title, onClose, children, wide }: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    wide?: boolean;
}): React.JSX.Element;
export declare function ProgressBar({ pct }: {
    pct: number;
}): React.JSX.Element;
export declare function Empty({ icon, text }: {
    icon: string;
    text: string;
}): React.JSX.Element;
export declare function Field({ label, children }: {
    label: string;
    children: React.ReactNode;
}): React.JSX.Element;
export declare function Spinner(): React.JSX.Element;
