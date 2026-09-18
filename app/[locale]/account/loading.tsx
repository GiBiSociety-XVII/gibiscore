import {Block, HeaderSkeleton, Rows, SkeletonFrame} from "@/components/shell/skeleton";

export default function Loading() {
    return (
        <SkeletonFrame wide>
            <HeaderSkeleton visual />
            <Block className="h-9 w-2/3" />
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <Rows count={3} />
                <Rows count={3} />
            </div>
            <Block className="h-40" />
        </SkeletonFrame>
    );
}
