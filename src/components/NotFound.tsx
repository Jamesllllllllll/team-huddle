import { Link } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'

export function NotFound({ children }: { children?: any }) {
  return (
    <div className="space-y-2 p-2">
      <div className="text-gray-600 dark:text-gray-400">
        {children || <p>The page you are looking for does not exist.</p>}
      </div>
      <p className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          onClick={() => window.history.back()}
          className="bg-emerald-500 text-white uppercase font-black text-sm hover:bg-emerald-600"
        >
          Go back
        </Button>
        <Button
          asChild
          className="bg-cyan-600 text-white uppercase font-black text-sm hover:bg-cyan-700"
        >
          <Link to="/">Start Over</Link>
        </Button>
      </p>
    </div>
  )
}
