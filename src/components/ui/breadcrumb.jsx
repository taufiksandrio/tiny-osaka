// shadcn/ui (MIT), adapted to JSX/arrow functions. Source: https://ui.shadcn.com/r/styles/new-york-v4/breadcrumb.json
import { cn } from "@/lib/utils";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { Slot } from "radix-ui";
const Breadcrumb = ({ ...props }) => {
    return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props}/>;
};
const BreadcrumbList = ({ className, ...props }) => {
    return (<ol data-slot="breadcrumb-list" className={cn("flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground sm:gap-2.5", className)} {...props}/>);
};
const BreadcrumbItem = ({ className, ...props }) => {
    return (<li data-slot="breadcrumb-item" className={cn("inline-flex items-center gap-1.5", className)} {...props}/>);
};
const BreadcrumbLink = ({ asChild, className, ...props }) => {
    const Comp = asChild ? Slot.Root : "a";
    return (<Comp data-slot="breadcrumb-link" className={cn("transition-colors hover:text-foreground", className)} {...props}/>);
};
const BreadcrumbPage = ({ className, ...props }) => {
    return (<span data-slot="breadcrumb-page" role="link" aria-disabled="true" aria-current="page" className={cn("font-normal text-foreground", className)} {...props}/>);
};
const BreadcrumbSeparator = ({ children, className, ...props }) => {
    return (<li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={cn("[&>svg]:size-3.5", className)} {...props}>
      {children ?? <ChevronRight />}
    </li>);
};
const BreadcrumbEllipsis = ({ className, ...props }) => {
    return (<span data-slot="breadcrumb-ellipsis" role="presentation" aria-hidden="true" className={cn("flex size-9 items-center justify-center", className)} {...props}>
      <MoreHorizontal className="size-4"/>
      <span className="sr-only">More</span>
    </span>);
};
export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis, };
