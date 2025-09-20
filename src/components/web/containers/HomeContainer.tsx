'use client';

import React from 'react';
import HomePresenter from '../presenters/HomePresenter';

export default function HomeContainer() {
  const handleAddToCart = () => {
    // Cart functionality will be added later
    console.log('Add to cart clicked');
  };

  return (
    <HomePresenter 
      onAddToCart={handleAddToCart}
    />
  );
}
