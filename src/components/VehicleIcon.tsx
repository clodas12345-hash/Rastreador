import { Car, CarFront, Truck, Bus, Bike } from 'lucide-react';

export const VehicleIcon = ({ type, iconType, color, size = 20, className = "", photoUrl, onClick }: any) => {
  if (photoUrl) {
    return (
      <div 
        onClick={onClick}
        className={`relative inline-flex items-center justify-center overflow-hidden rounded-full border-2 border-white shadow-md bg-gray-100 shrink-0 cursor-pointer hover:scale-105 transition-transform ${className}`}
        style={{ width: size + 8, height: size + 8 }}
        title="Clique para ver a foto ampliada"
      >
        <img referrerPolicy="no-referrer" src={photoUrl} 
          alt="Ícone / Foto" 
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  switch (iconType) {
    case 'truck': return <Truck size={size} color={color || "currentColor"} fill={color ? "currentColor" : "none"} className={className} onClick={onClick} />;
    case 'bus': return <Bus size={size} color={color || "currentColor"} fill={color ? "currentColor" : "none"} className={className} onClick={onClick} />;
    case 'motorcycle': return <Bike size={size} color={color || "currentColor"} fill={color ? "currentColor" : "none"} className={className} onClick={onClick} />;
    case 'car-front': return <CarFront size={size} color={color || "currentColor"} fill={color ? "currentColor" : "none"} className={className} onClick={onClick} />;
    case 'car': 
    default: 
      return <Car size={size} color={color || "currentColor"} fill={color ? "currentColor" : "none"} className={className} onClick={onClick} />;
  }
}
