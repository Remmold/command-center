import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { memo, useRef, type ReactNode } from 'react'
import { CopyButton } from './CopyButton'

/** What "Copy code" copies, as the extension's `F8n`: a diff whole, anything else without trailing whitespace. */
export function codeCopyText(text: string, codeClass: string | undefined): string {
  return /\blanguage-(diff|patch)\b/i.test(codeClass ?? '') || /^(diff --git |--- .*\n\+\+\+ )/.test(text) ? text : text.trimEnd()
}

function CodeBlock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLPreElement | null>(null)
  const getText = (): string => codeCopyText(ref.current?.textContent ?? '', ref.current?.querySelector('code')?.className)
  return (
    <div className="group/code relative my-2">
      <pre ref={ref} className="overflow-x-auto rounded border border-subtle bg-editor px-3 py-2 font-mono text-[12px] leading-[18px]">
        {children}
      </pre>
      <div className="absolute right-1 top-1">
        <CopyButton getText={getText} reveal="code" framed />
      </div>
    </div>
  )
}

const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS: Options['rehypePlugins'] = [[rehypeHighlight, { detect: true, ignoreMissing: true }]]

// Module-level, so each render keeps the same element types and React updates the DOM instead of remounting it.
const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-6 marker:text-muted">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-6 marker:text-muted">{children}</ol>,
  li: ({ children }) => <li className="my-0.5 pl-0.5">{children}</li>,
  h1: ({ children }) => <h1 className="mb-2 mt-4 border-b border-subtle pb-1 text-[18px] font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-[15px] font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-[13px] font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-3 text-[13px] font-semibold text-muted first:mt-0">{children}</h4>,
  hr: () => <hr className="my-3 border-subtle" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-link hover:underline">
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = (className ?? '').includes('language-') || (className ?? '').includes('hljs')
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }
    return <code className="rounded-sm bg-code px-1 py-px font-mono text-[12px] text-code-fg">{children}</code>
  },
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-[3px] border-strong pl-3 text-muted">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-strong px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-strong px-2 py-1">{children}</td>
}

/** Memoised: a long chat re-renders often, and parsing plus highlighting every message again is what made clicks slow. */
export const Markdown = memo(function Markdown({ text, tone = 'normal' }: { text: string; tone?: 'normal' | 'muted' }) {
  return (
    <div className={`markdown break-words text-[13px] leading-[1.6] ${tone === 'muted' ? 'text-muted' : 'text-fg'}`}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
