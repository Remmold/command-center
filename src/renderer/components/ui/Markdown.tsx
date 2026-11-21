import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-[13px] leading-relaxed text-zinc-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          p: ({ children }) => <p className="my-2 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="my-1">{children}</li>,
          h1: ({ children }) => <h1 className="my-3 text-lg font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="my-3 text-base font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="my-2 text-sm font-semibold">{children}</h3>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock =
              (className ?? '').includes('language-') || (className ?? '').includes('hljs')
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[12px] text-amber-300">
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-md border border-zinc-800 bg-black/60 px-4 py-3 text-[12px]">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-zinc-700 pl-3 text-zinc-300">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="border-collapse text-[12px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-800 bg-zinc-900 px-2 py-1 text-left">{children}</th>
          ),
          td: ({ children }) => <td className="border border-zinc-800 px-2 py-1">{children}</td>
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
