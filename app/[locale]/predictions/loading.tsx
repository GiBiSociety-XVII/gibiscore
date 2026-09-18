import {Block, HeaderSkeleton, Rows, SkeletonFrame} from "@/components/shell/skeleton";

export default function Loading() {
    return (
        <SkeletonFrame wide>
            <HeaderSkeleton />
            <Block className="h-12" />
            <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
                <Rows count={4} height="h-16" />
                <Rows count={4} height="h-16" />
            </div>
        </SkeletonFrame>
    );
}
