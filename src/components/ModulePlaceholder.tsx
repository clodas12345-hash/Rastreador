export default function ModulePlaceholder({name}: {name: string}) {
  return (
    <div className="flex-grow flex items-center justify-center h-full">
      <h2 className="text-2xl font-bold text-gray-500">{name} - Em Desenvolvimento</h2>
    </div>
  );
}
