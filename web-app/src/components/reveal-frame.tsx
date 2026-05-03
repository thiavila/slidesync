"use client";

import { useEffect, useMemo, useRef } from "react";
import { injectVisibleBridge } from "@/lib/reveal/bridge";

interface RevealFrameProps {
  html: string;
  className?: string;
}

export default function RevealFrame({ html, className }: RevealFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => injectVisibleBridge(html), [html]);

  useEffect(() => {
    const t = setTimeout(() => {
      iframeRef.current?.focus();
      iframeRef.current?.contentWindow?.focus();
    }, 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      className={className ?? "w-full h-full border-0"}
      title="Reveal presentation"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    />
  );
}
