import { useMemo } from 'react'
import { Download } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { generateHuddleReportMarkdown } from './generateReport'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { PlanningItemType } from '~/types'
import type { TranscriptEntry } from './types'

type PlanningItem = {
    id: string
    type: PlanningItemType
    text: string
    timestamp: string
    order?: number
    blockedBy?: string[]
}

type HuddleData = {
    name: string
    createdAt: string
    endedAt?: string
    planningItems: PlanningItem[]
    transcriptChunks?: Array<{
        id: string
        payload: string
        createdAt: string
        metadata?: {
            speakerLabel?: string
            speakerId?: string
        }
    }>
    [key: string]: unknown // Allow additional properties from the actual huddle object
}

type ReportModalProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    huddle: HuddleData
    transcriptEntries: TranscriptEntry[]
}

export function ReportModal({
    open,
    onOpenChange,
    huddle,
    transcriptEntries,
}: ReportModalProps) {
    const markdown = useMemo(
        () => generateHuddleReportMarkdown(huddle as Parameters<typeof generateHuddleReportMarkdown>[0], transcriptEntries),
        [huddle, transcriptEntries],
    )

    const handleDownload = () => {
        const blob = new Blob([markdown], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${huddle.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.md`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-dvw sm:max-w-7xl! sm:w-[calc(100%-4rem)] h-full rounded-none sm:rounded-lg sm:max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Huddle Report</DialogTitle>
                    <DialogDescription>
                        Download a markdown version of all huddle data including planning items and transcript.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-auto border rounded-lg p-6">
                    <MarkdownRenderer content={markdown} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    <Button onClick={handleDownload}>
                        <Download className="mr-2 h-4 w-4" />
                        Download Report
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

