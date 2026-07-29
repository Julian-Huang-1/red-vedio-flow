import { ArrowRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function HomePage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
      <section className="w-full max-w-2xl rounded-2xl border bg-card p-10 shadow-2xl shadow-black/10">
        <span className="text-sm font-medium text-muted-foreground">Home</span>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">项目已就绪</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          基于 Vite、React、TypeScript、Tailwind CSS 和 shadcn/ui 的干净应用骨架。
        </p>
        <div className="mt-8">
          <Button asChild>
            <Link to="/workflow">
              进入工作流
              <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
