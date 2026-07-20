import React, { useMemo } from 'react';
import { motion, Variants } from 'framer-motion';

interface AnimatedTextProps {
  text: string;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  mode?: 'auto' | 'word' | 'char' | 'none';
  stagger?: number;
  delay?: number;
  once?: boolean;
}

const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  as: Component = 'span',
  className = '',
  mode = 'none', // Default to none for better performance
  delay = 0,
  once = true, // Default to true to avoid re-animating constantly
}) => {

  // Animation Variants
  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        delay: delay,
        ease: 'easeOut',
      },
    },
  };

  const MotionContainer = useMemo(() => motion(Component), [Component]);

  // If mode is simple or none, just plain fade in
  if (mode === 'none' || mode === 'auto') {
     return (
        <MotionContainer
            className={className}
            initial="hidden"
            whileInView="visible"
            viewport={{ once }}
            variants={containerVariants}
        >
            {text}
        </MotionContainer>
     );
  }

  // Fallback for explicitly requested complex animations (if any)
  // But for this performance pass, we treat 'word' same as block for now unless critical
  
  return (
    <MotionContainer
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once }}
      variants={containerVariants}
    >
      {text}
    </MotionContainer>
  );
};

export default AnimatedText;
