import { useState, useEffect, useRef } from 'react';

export function useCustomExpressions() {
  const [customExpressions, setCustomExpressions] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('yuihime_custom_expressions_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const customExpressionsRef = useRef<any[]>([]);

  useEffect(() => {
    customExpressionsRef.current = customExpressions;
  }, [customExpressions]);

  useEffect(() => {
    const handleUpdate = () => {
      try {
        const saved = localStorage.getItem('yuihime_custom_expressions_v1');
        setCustomExpressions(saved ? JSON.parse(saved) : []);
      } catch (e) {}
    };
    
    window.addEventListener('yuihime_custom_expressions_changed', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    
    return () => {
      window.removeEventListener('yuihime_custom_expressions_changed', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return {
    customExpressions,
    customExpressionsRef,
  };
}
