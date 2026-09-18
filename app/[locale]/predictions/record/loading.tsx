import {Block, HeaderSkeleton, Rows, SkeletonFrame} from "@/components/shell/skeleton";

export default function Loading() {
    return (
        <SkeletonFrame wide>
            <HeaderSkeleton />
            <Block className="h-40" />
            <Block className="h-40" />
            <Rows count={5} />
        </SkeletonFrame>
    );
}
