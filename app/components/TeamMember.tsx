import type { TeamMemberProps } from '../../types';

const TeamMember = ({ 
  name, 
  title, 
  experience, 
  description, 
  image 
}: TeamMemberProps): React.ReactElement => {
  return (
    <div className="card text-center card-accent">
      <div className="mb-6 overflow-hidden bg-brand-light rounded-lg" style={{ height: '250px' }}>
        {image ? (
          <img 
            src={image} 
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-5xl mb-2">👤</p>
              <p className="text-xs text-brand-gray font-semibold">Professional Photo</p>
            </div>
          </div>
        )}
      </div>
      <h4 className="text-brand-dark font-semibold mb-2">{name}</h4>
      <p className="text-brand-red font-bold text-sm mb-2">{title}</p>
      {experience && (
        <p className="text-xs text-brand-gray mb-4 font-medium">{experience}</p>
      )}
      {description && (
        <p className="text-xs text-brand-gray leading-relaxed">{description}</p>
      )}
    </div>
  );
};

export default TeamMember;