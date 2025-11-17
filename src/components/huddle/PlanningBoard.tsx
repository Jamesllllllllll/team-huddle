import { Card, CardContent } from '~/components/ui/card'
import { PRIMARY_COLUMN_CONFIG } from './constants'
import type { PlanningItemType } from '~/types'
import type { ReactNode } from 'react'

type PlanningBoardProps = {
    groupedItems: Record<PlanningItemType, any[]>
    renderItemList: (items: any[], type: PlanningItemType) => ReactNode
}

export function PlanningBoard({ groupedItems, renderItemList }: PlanningBoardProps) {
    return (
        <section className="space-y-6">
            <Card
                className="relative overflow-hidden border border-primary/50 shadow-xl py-0"
                style={{
                    background: `linear-gradient(to bottom right, var(--column-container-from), var(--column-container-via), var(--column-container-to))`,
                }}
            >
                <div className="pointer-events-none absolute -top-24 right-[-10%] size-[320px] rounded-full bg-primary/5 blur-3xl opacity-60 dark:bg-primary/10" aria-hidden />
                <div className="pointer-events-none absolute -bottom-32 left-[-15%] size-[380px] rounded-full bg-accent/10 blur-3xl opacity-70 dark:bg-accent/20" aria-hidden />
                <CardContent className="relative z-10 px-0">
                    <div className="flex flex-col divide-y divide-primary/20 md:flex-row md:divide-y-0 md:divide-x">
                        {PRIMARY_COLUMN_CONFIG.map((column) => {
                            const Icon = column.icon
                            const items = groupedItems[column.type]
                            return (
                                <div
                                    key={column.type}
                                    className="flex-1 min-w-[240px] px-4 md:px-6 py-6"
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className={`relative flex size-12 items-center justify-center rounded-3xl bg-linear-to-br ${column.accentClass} shadow-sm ring-1 ring-white/60 dark:ring-white/10`}
                                        >
                                            <Icon className="size-6" strokeWidth={1.6} />
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-3xl font-semibold">
                                                {column.title}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="mt-5">
                                        {renderItemList(items, column.type)}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}

