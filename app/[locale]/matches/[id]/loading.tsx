import {Block, Rows, SkeletonFrame} from "@/components/shell/skeleton";

export default function Loading() {
    return (
        <SkeletonFrame>
            <Block className="h-44" />
            <Block className="h-10" />
            <Rows count={6} />
        </SkeletonFrame>
    );
}
