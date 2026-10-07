import React from 'react';
export default function Login({ pairToken, onLogin }: {
    pairToken: string | null;
    onLogin: (t: string) => void;
}): React.JSX.Element;
