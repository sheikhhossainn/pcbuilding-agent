/** The pill at the top of a bottom sheet that says "drag me down to close". Phones only. */
export default function SheetGrabber(props) {
  return (
    <div {...props} className="sm:hidden flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing" aria-hidden="true">
      <span className="w-9 h-1.5 rounded-full bg-line-strong" />
    </div>
  );
}
