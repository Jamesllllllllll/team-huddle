import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardFooter } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'
import { EditableText } from '../EditableText'
import { PLANNING_ITEM_TYPE_LABELS, type PlanningItemType } from '~/types'
import { PLANNING_EMPTY_MESSAGES } from './constants'
import { Search } from 'lucide-react'

type PlanningItem = {
    id: string
    text: string
    type: PlanningItemType
    speakerId?: string | null
    speakerLabel?: string | null
    blockedBy?: string[] | null
    huddleId: string
    timestamp: string
    metadata?: {
        needsResearch?: boolean
        [key: string]: unknown
    } | null
}

type Participant = {
    userId?: string | null
    displayName?: string | null
}

type PlanningItemListProps = {
    items: PlanningItem[]
    type: PlanningItemType
    participantsByUserId: Map<string, Participant>
    participantsByName: Map<string, Participant>
    participantColors: Map<string, {
        borderColorLight: string
        borderColorDark: string
        textColorLight: string
        textColorDark: string
    }>
    planningItemsById: Record<string, PlanningItem>
    highlightedItemId: string | null
    newlyAddedItemIds: Set<string>
    primaryForegroundColor: string
    isDark: boolean
    huddleId: string
    itemRefs: React.MutableRefObject<Map<string, HTMLElement>>
    onItemRef: (id: string) => (el: HTMLElement | null) => void
    onUpdateItem: (id: any, text: string) => void
    onDeleteItem: (id: any) => void
    onResearchClick?: (itemId: string, itemText: string) => void
    canEdit?: boolean
}

export function PlanningItemList({
    items,
    type,
    participantsByUserId,
    participantsByName,
    participantColors,
    planningItemsById,
    highlightedItemId,
    newlyAddedItemIds,
    primaryForegroundColor,
    isDark,
    huddleId,
    itemRefs,
    onItemRef,
    onUpdateItem,
    onDeleteItem,
    onResearchClick,
    canEdit = true,
}: PlanningItemListProps) {
    if (items.length === 0) {
        return (
            <p className="text-sm italic">
                {PLANNING_EMPTY_MESSAGES[type] ?? 'Nothing captured yet.'}
            </p>
        )
    }

    return (
        <ul className="planning-item-list space-y-3">
            <AnimatePresence mode="popLayout" initial={false}>
                {items.map((item) => {
                    const normalizedSpeakerId =
                        typeof item.speakerId === 'string' ? item.speakerId.trim() : ''
                    const speakerParticipant =
                        normalizedSpeakerId.length > 0
                            ? participantsByUserId.get(normalizedSpeakerId)
                            : typeof item.speakerLabel === 'string' && item.speakerLabel.trim().length > 0
                                ? participantsByName.get(item.speakerLabel.trim().toLowerCase())
                                : undefined
                    const speakerDisplayName =
                        (typeof speakerParticipant?.displayName === 'string' &&
                            speakerParticipant.displayName.trim().length > 0
                            ? speakerParticipant.displayName.trim()
                            : typeof item.speakerLabel === 'string'
                                ? item.speakerLabel.trim()
                                : ''
                        ) || ''

                    // Get participant color for badge
                    const participantKey =
                        normalizedSpeakerId.length > 0
                            ? normalizedSpeakerId
                            : speakerDisplayName.length > 0
                                ? speakerDisplayName.toLowerCase()
                                : null
                    const badgeColorData = participantKey ? participantColors.get(participantKey) : null
                    const badgeColor = badgeColorData ? {
                        borderColor: isDark ? badgeColorData.borderColorDark : badgeColorData.borderColorLight,
                        textColor: isDark ? badgeColorData.textColorDark : badgeColorData.textColorLight,
                    } : null

                    const isHighlighted = highlightedItemId === item.id
                    const itemRef = onItemRef(item.id)

                    const isNewlyAdded = newlyAddedItemIds.has(item.id)
                    const needsResearch = item.metadata?.needsResearch === true && type === 'idea'

                    return (
                        <motion.li
                            key={item.id}
                            ref={itemRef}
                            className="group py-1 transition-all hover:-translate-y-0.5"
                            layout
                            initial={{ opacity: 0 }}
                            animate={{
                                opacity: 1,
                            }}
                            transition={{
                                opacity: { duration: 0.3 },
                            }}
                            exit={{ 
                                opacity: 0,
                                filter: 'blur(8px)',
                                transition: { duration: 0.3 }
                            }}
                        >
                            <div
                                className="rounded-lg border-2"
                                style={{
                                    borderColor: isNewlyAdded ? primaryForegroundColor : 'transparent',
                                }}
                            >
                                <Card className="gap-0 border-0 pt-2 pb-4">
                                <CardContent className="p-2 py-0">
                                    <EditableText
                                        fieldName="text"
                                        value={item.text}
                                        inputClassName="w-full rounded-xl border px-[7px] py-[7px] leading-relaxed text-sm h-fit min-h-fit"
                                        inputLabel={`Edit ${PLANNING_ITEM_TYPE_LABELS[type]} text`}
                                        buttonClassName="w-full px-2 h-fit text-left text-sm leading-relaxed"
                                        buttonLabel={`Edit ${PLANNING_ITEM_TYPE_LABELS[type]} text`}
                                        onChange={(value) => {
                                            const text = value.trim()
                                            if (!text) return
                                            onUpdateItem(item.id, text)
                                        }}
                                        disabled={!canEdit}
                                    />
                                    {item.blockedBy && item.blockedBy.length > 0 ? (
                                        <p className="mt-2 px-2 text-xs font-medium text-muted-foreground">
                                            Blocked by{' '}
                                            {item.blockedBy
                                                .map((id) => planningItemsById[id]?.text ?? id)
                                                .join(', ')}
                                        </p>
                                    ) : null}
                                </CardContent>

                                <CardFooter className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs">
                                    {speakerDisplayName.length > 0 ? (
                                        <Badge
                                            variant="outline"
                                            className="cursor-default"
                                            style={{
                                                borderColor: badgeColor?.borderColor,
                                                color: badgeColor?.textColor,
                                            }}
                                        >
                                            {speakerDisplayName}
                                        </Badge>
                                    ) : null}
                                    {needsResearch && onResearchClick ? (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon-sm"
                                                        className="size-6 rounded-full hover:bg-blue-500/90 border-none text-muted-foreground"
                                                        onClick={() => {
                                                            onResearchClick(item.id, item.text)
                                                        }}
                                                    >
                                                        <Search className="size-3" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Research this topic</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    ) : null}
                                    {/* Don't show delete button for summary items or non-participants */}
                                    {type !== 'summary' && canEdit && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon-sm"
                                            className="size-6 rounded-full hover:bg-red-500/90 border-none text-muted-foreground"
                                            onClick={() => {
                                                onDeleteItem(item.id)
                                            }}
                                        >
                                            X
                                        </Button>
                                    )}
                                </CardFooter>
                                </Card>
                            </div>
                        </motion.li>
                    )
                })}
            </AnimatePresence>
        </ul>
    )
}

