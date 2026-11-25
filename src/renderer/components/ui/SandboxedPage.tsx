/**
 * A page from one of the app's read-only schemes in a frame that may run its own script but gets an opaque origin:
 * no access to the app, no popups, no top-level navigation. The scheme's policy keeps it off the network.
 */
export function SandboxedPage({ url, title }: { url: string; title: string }) {
  return <iframe src={url} title={title} sandbox="allow-scripts" allow="clipboard-write" referrerPolicy="no-referrer" className="h-full w-full flex-1 border-0 bg-editor" />
}
