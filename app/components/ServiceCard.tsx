import type { ServiceCardProps } from '../../types';

interface ServiceCardPropsExtended extends ServiceCardProps {
  delay?: number;
}

const ServiceCard = ({ 
  icon, 
  title, 
  description,
  delay = 0
}: ServiceCardPropsExtended): React.ReactElement => {
  return (
    <div 
      className="card animate-slide-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="text-5xl mb-6 font-bold text-brand-red">{icon}</div>
      <h4 className="text-brand-dark font-semibold mb-3">{title}</h4>
      <p className="text-sm text-brand-gray leading-relaxed">{description}</p>
    </div>
  );
};

export default ServiceCard;