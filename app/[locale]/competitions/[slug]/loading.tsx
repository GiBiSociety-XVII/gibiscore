import {Block, HeaderSkeleton, Rows, SkeletonFrame} from "@/components/shell/skeleton";

export default function Loading() {
    return (
        <SkeletonFrame>
            <HeaderSkeleton visual />
            <Block className="h-10" />
            <Rows count={8} />
        </SkeletonFrame>
    );
}
