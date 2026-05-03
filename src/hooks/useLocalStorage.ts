"use client";

import { useState, useEffect, useCallback } from 'react';

// Helper para fazer parse de JSON de forma segura, retornando um valor fallback em caso de erro ou null.
function safeJsonParse<T>(jsonString: string | null, fallback: T): T {
  if (jsonString === null) {
    return fallback;
  }
  try {
    // JSON.parse irá lançar um erro para a string "undefined".
    // Retorna o fallback se o resultado do parse for undefined.
    const parsed = JSON.parse(jsonString);
    return parsed === undefined ? fallback : (parsed as T);
  } catch (e) {
    // console.warn(`Error parsing JSON from localStorage for key: ${keyBeingParsed}`, e); // keyBeingParsed não está no escopo aqui
    return fallback;
  }
}

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // Estado para armazenar nosso valor.
  // Passa uma função para o useState para que a lógica seja executada apenas na renderização inicial.
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      // Faz o parse do JSON armazenado ou, se não houver, retorna initialValue.
      return item ? safeJsonParse<T>(item, initialValue) : initialValue;
    } catch (error) {
      // Retorna initialValue em caso de erro.
      console.error(`Error reading localStorage key "${key}" during useState init:`, error);
      return initialValue;
    }
  });

  // useEffect para atualizar o localStorage quando o estado storedValue muda.
  // Isso também lida com a escrita do initialValue no localStorage se ele não estava presente inicialmente.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]); // Executa novamente apenas se key ou storedValue mudar.

  // A função setValue. Usamos useCallback para garantir que ela tenha uma identidade estável.
  // setStoredValue do useState é garantidamente estável.
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      setStoredValue(value);
      // O useEffect acima cuidará de persistir no localStorage.
    },
    [setStoredValue] // setStoredValue é estável, então este useCallback é estável.
                     // Poderia ser simplemente `[]` também.
  );

  return [storedValue, setValue];
}

export default useLocalStorage;
