import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, documentId, getDoc, getDocs, increment, limit, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { auth, db, firestoreDoc } from '../firebaseConfig';
import { SafeAreaProvider } from 'react-native-safe-area-context';
const { width, height } = Dimensions.get('window');

// Manual category list
const categories = [
  { id: 'fruits', name: 'Fruits', icon: '🍎', image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&q=80&w=1740&ixlib=rb-4.0.3' },
  { id: 'vegetables', name: 'Vegetables', icon: '🥦', image: 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?auto=format&fit=crop&q=80&w=1932&ixlib=rb-4.0.3' },
  { id: 'dairy', name: 'Dairy', icon: '🥛', image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&q=80&w=1887&ixlib=rb-4.0.3' },
  { id: 'bakery', name: 'Bakery', icon: '🍞', image: 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&q=80&w=1932&ixlib=rb-4.0.3' },
  { id: 'meat', name: 'Meat', icon: '🥩', image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&q=80&w=1740&ixlib=rb-4.0.3' },
  { id: 'snacks', name: 'Snacks', icon: '🍿', image: 'https://images.unsplash.com/photo-1599629954294-14df9f8291bc?auto=format&fit=crop&q=80&w=1964&ixlib=rb-4.0.3' }
];


export default function Home() {
  const navigation = useNavigation();
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeSlots, setTimeSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [userAddress, setUserAddress] = useState({
    formatted: '',
    street: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [userName, setUserName] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [popularSearches, setPopularSearches] = useState([
    'Milk', 'Bread', 'Eggs', 'Bananas', 'Rice', 'Chicken'
  ]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash'); // Default to cash on delivery
  const [cardDetails, setCardDetails] = useState({
    number: '',
    expiry: '',
    cvc: '',
    name: '',
    last4: '',
    brand: ''
  });

  const [activeOrders, setActiveOrders] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
useEffect(() => {
    // Check authentication state
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUserLoggedIn(true);
        await fetchUserData(user.uid);
        await fetchCartItems(user.uid);
        await fetchWishlistItems(user.uid);
        await loadSearchHistory(user.uid);
        await fetchActiveOrders(user.uid);
      } else {
        setUserLoggedIn(false);
        setUserName('');
        setCartItems([]);
        setWishlistItems([]);
        setSearchHistory([]);
        setActiveOrders([]);
      }
    });

    // Fetch all products
    fetchProducts();
    
    // Generate delivery time slots
    generateTimeSlots();
    
    // Load recently viewed from AsyncStorage
    loadRecentlyViewed();

    // Request location permissions
    requestLocationPermission();

    return () => unsubscribe();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        getCurrentLocation();
      }
    } catch (error) {
      console.error("Error requesting location permission:", error);
    }
  };

  const loadRecentlyViewed = async () => {
    try {
      const storedItems = await AsyncStorage.getItem('recentlyViewed');
      if (storedItems) {
        setRecentlyViewed(JSON.parse(storedItems));
      }
    } catch (error) {
      console.error("Error loading recently viewed items:", error);
    }
  };

  const fetchUserData = async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserName(userData.displayName || userData.firstName || '');
        
        if (userData.address) {
          setUserAddress(userData.address);
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

 const fetchActiveOrders = async (userId, setActiveOrders) => {
  try {
    const ordersRef = collection(db, 'users', userId, 'orders');
    const q = query(ordersRef, where('status', 'in', [
      'pending', 'confirmed', 'preparing', 'out_for_delivery'
    ]));
    
    const querySnapshot = await getDocs(q);
    const orders = [];

    for (const orderDoc of querySnapshot.docs) {
      const orderData = orderDoc.data();
      let shopName = 'Unknown Shop';

      if (orderData.shopId) {
        try {
          const shopRef = firestoreDoc(db, 'shops', orderData.shopId);
          const shopSnap = await getDoc(shopRef);
          if (shopSnap.exists()) {
            shopName = shopSnap.data().name;
          }
        } catch (error) {
          console.error("Error fetching shop details:", error);
        }
      }

      orders.push({
        id: orderDoc.id,
        ...orderData,
        shopName
      });
    }

    setActiveOrders(orders);
  } catch (error) {
    console.error("Error fetching active orders:", error);
  }
};

  const loadSearchHistory = async (userId) => {
    try {
      const searchHistoryRef = collection(db, 'users', userId, 'searchHistory');
      const searchHistorySnapshot = await getDocs(query(searchHistoryRef, limit(5)));
      
      const searches = searchHistorySnapshot.docs.map(doc => doc.data().query);
      setSearchHistory(searches);
    } catch (error) {
      console.error("Error loading search history:", error);
    }
  };

  const saveSearchToHistory = async (searchTerm) => {
    if (!auth.currentUser || !searchTerm.trim()) return;
    
    try {
      const userId = auth.currentUser.uid;
      const searchHistoryRef = collection(db, 'users', userId, 'searchHistory');
      
      // Check if search term already exists
      const existingQuery = query(searchHistoryRef, where('query', '==', searchTerm.trim()));
      const existingDocs = await getDocs(existingQuery);
      
      if (existingDocs.empty) {
        // Add new search term
        await addDoc(searchHistoryRef, {
          query: searchTerm.trim(),
          timestamp: new Date()
        });
      } else {
        // Update timestamp of existing search
        const docId = existingDocs.docs[0].id;
        await updateDoc(doc(searchHistoryRef, docId), {
          timestamp: new Date()
        });
      }
      
      // Refresh search history
      loadSearchHistory(userId);
    } catch (error) {
      console.error("Error saving search history:", error);
    }
  };

  const fetchWishlistItems = async (userId) => {
    try {
      const wishlistRef = collection(db, 'users', userId, 'wishlist');
      const wishlistSnapshot = await getDocs(wishlistRef);
      
      const wishlistData = [];
      for (const wishlistDoc of wishlistSnapshot.docs) {
        wishlistData.push({
          id: wishlistDoc.id,
          productId: wishlistDoc.data().productId
        });
      }
      
      setWishlistItems(wishlistData);
    } catch (error) {
      console.error("Error fetching wishlist items:", error);
    }
  };

  const fetchProducts = async (categoryId = null) => {
    try {
      setLoading(true);
      let productsQuery;
      
      if (categoryId) {
        setSelectedCategory(categoryId);
        productsQuery = query(
          collection(db, 'products'), 
          where('category', '==', categoryId)
        );
      } else {
        setSelectedCategory(null);
        productsQuery = collection(db, 'products');
      }
      
      const querySnapshot = await getDocs(productsQuery);
      const products = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setAllProducts(products);
      
      // Get trending products - products with high ratings or special trending flag
      const trending = products
        .filter(p => p.trending || (p.rating && p.rating >= 4.5))
        .slice(0, 8);
      
      setTrendingProducts(trending.length ? trending : products.slice(0, 8));
      setFilteredProducts(products);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching products:", error);
      setLoading(false);
    }
  };

  // Improved search functionality
  useEffect(() => {
    if (!allProducts || allProducts.length === 0) return;
    
    let results = [...allProducts];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      results = allProducts.filter(product => 
        (product.name && product.name.toLowerCase().includes(query)) ||
        (product.description && product.description.toLowerCase().includes(query)) ||
        (product.category && product.category.toLowerCase().includes(query)) ||
        (product.tags && Array.isArray(product.tags) && product.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }
    
    if (selectedCategory) {
      results = results.filter(product => product.category === selectedCategory);
    }
    
    if (useCurrentLocation && userAddress.city) {
      results = results.filter(product => 
        !product.availableCities || 
        (Array.isArray(product.availableCities) && product.availableCities.includes(userAddress.city))
      );
    }
    
    setFilteredProducts(results);
  }, [searchQuery, useCurrentLocation, allProducts, userAddress.city, selectedCategory]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      saveSearchToHistory(searchQuery);
      setIsSearchModalOpen(false);
    }
  };

  const selectSearchTerm = (term) => {
    setSearchQuery(term);
    setSearchFocused(false);
    setIsSearchModalOpen(false);
    if (term.trim()) {
      saveSearchToHistory(term);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const generateTimeSlots = () => {
    const slots = [];
    const now = new Date();
    let hour = now.getHours();
    
    if (now.getMinutes() > 45) hour += 1;
    
    for (let i = 0; i < 12; i++) {
      const slotHour = (hour + i) % 24;
      slots.push(`${slotHour}:00 - ${slotHour}:15`);
      slots.push(`${slotHour}:15 - ${slotHour}:30`);
      slots.push(`${slotHour}:30 - ${slotHour}:45`);
      slots.push(`${slotHour}:45 - ${(slotHour + 1) % 24}:00`);
    }
    
    setTimeSlots(slots);
    setSelectedSlot(slots[0]);
  };

  const handleAddressChange = (name, value) => {
    setUserAddress(prev => ({
      ...prev,
      [name]: value,
      formatted: name === 'formatted' ? value : `${prev.street || ''}, ${prev.city || ''}, ${prev.state || ''}, ${prev.pincode || ''}`.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',')
    }));
  };

  const saveAddress = async () => {
    if (auth.currentUser) {
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          address: userAddress
        });
        setIsEditingAddress(false);
        Toast.show({
          type: 'success',
          text1: 'Address saved successfully!'
        });
      } catch (error) {
        console.error("Error updating address:", error);
        Toast.show({
          type: 'error',
          text1: 'Failed to save address'
        });
      }
    } else {
      Toast.show({
        type: 'info',
        text1: 'Please login to save your address'
      });
      navigation.navigate('Login');
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: 'Location permission denied'
        });
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.coords.latitude}&lon=${location.coords.longitude}`
        );
        const data = await response.json();
        
        if (data.address) {
          const newAddress = {
            formatted: data.display_name,
            street: `${data.address.road || ''} ${data.address.house_number || ''}`.trim(),
            city: data.address.city || data.address.town || data.address.village || '',
            state: data.address.state || '',
            pincode: data.address.postcode || '',
          };
          
          setUserAddress(newAddress);
          
          if (auth.currentUser) {
            const userRef = doc(db, 'users', auth.currentUser.uid);
            await updateDoc(userRef, { address: newAddress });
            Toast.show({
              type: 'success',
              text1: 'Location updated successfully'
            });
          }
        }
      } catch (error) {
        console.error("Error fetching location data:", error);
        Toast.show({
          type: 'error',
          text1: 'Failed to get your location'
        });
      }
    } catch (error) {
      console.error("Geolocation error:", error);
      Toast.show({
        type: 'error',
        text1: 'Could not access your location'
      });
    }
  };

  const toggleLocationMode = () => {
    setUseCurrentLocation(prev => !prev);
    if (!useCurrentLocation) {
      getCurrentLocation();
    }
  };

  // Improved cart fetching with error handling
  const fetchCartItems = async (userId) => {
    try {
      const cartRef = doc(db, "carts", userId);
      const cartSnap = await getDoc(cartRef);
      
      if (!cartSnap.exists()) {
        // Initialize cart if it doesn't exist
        await setDoc(cartRef, {
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          total: 0
        });
        setCartItems([]);
        return [];
      }

      const cartData = cartSnap.data();
      const items = cartData.items || [];
      
      // Filter out any invalid items
      const validItems = items.filter(item => 
        item && item.productId && typeof item.quantity === 'number'
      );

      if (validItems.length === 0) {
        setCartItems([]);
        return [];
      }

      const productIds = validItems.map(item => item.productId);
      
      // Fetch product data in batches of 10 (Firestore limit for 'in' queries)
      const mergedItems = [];
      
      for (let i = 0; i < productIds.length; i += 10) {
        const batchIds = productIds.slice(i, i + 10);
        
        if (batchIds.length > 0) {
          const productsQuery = query(
            collection(db, "products"),
            where(documentId(), "in", batchIds)
          );
          
          const productsSnap = await getDocs(productsQuery);
          const productsMap = {};
          
          productsSnap.forEach(doc => {
            productsMap[doc.id] = {
              id: doc.id,
              ...doc.data()
            };
          });
          
          // Process this batch of items
          validItems
            .filter(item => batchIds.includes(item.productId))
            .forEach(item => {
              mergedItems.push({
                ...item,
                product: productsMap[item.productId] || {
                  id: item.productId,
                  name: "Product not found",
                  price: 0,
                  imageUrl: "/placeholder.jpg"
                }
              });
            });
        }
      }
      
      setCartItems(mergedItems);
      return mergedItems;
      
    } catch (error) {
      console.error("Error fetching cart items:", error);
      Toast.show({
        type: 'error',
        text1: 'Failed to load cart items'
      });
      setCartItems([]);
      return [];
    }
  };

  // Add to cart with validation
  const handleAddToCart = async (product) => {
    try {
      if (!product || !product.id) {
        Toast.show({
          type: 'error',
          text1: 'Invalid product'
        });
        return false;
      }

      if (!auth.currentUser) {
        Toast.show({
          type: 'info',
          text1: 'Please log in to add items to cart'
        });
        navigation.navigate('Login');
        return false;
      }

      const userId = auth.currentUser.uid;
      const cartRef = doc(db, "carts", userId);
      const cartSnap = await getDoc(cartRef);
      
      let items = [];
      if (cartSnap.exists()) {
        items = [...(cartSnap.data().items || [])];
      } else {
        // Initialize cart if it doesn't exist
        await setDoc(cartRef, {
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          total: 0
        });
      }

      // Validate product data
      const safeProduct = {
        productId: product.id,
        quantity: 1,
        price: Number(product.price) || 0,
        name: String(product.name) || "Unnamed Product",
        image: product.imageUrl || ""
      };

      const existingIndex = items.findIndex(item => 
        item && item.productId === product.id
      );

      if (existingIndex >= 0) {
        items[existingIndex].quantity += 1;
        Toast.show({
          type: 'success',
          text1: `Added another ${product.name} to cart`
        });
      } else {
        items.push(safeProduct);
        Toast.show({
          type: 'success',
          text1: `${product.name} added to cart`
        });
      }

      // Calculate total
      const total = items.reduce((sum, item) => {
        return sum + ((item.price || 0) * (item.quantity || 0));
      }, 0);

      await updateDoc(cartRef, {
        items: items.filter(item => item), // Remove any null/undefined
        updatedAt: new Date(),
        total: total
      });

      // Refresh cart items
      await fetchCartItems(userId);
      return true;
    } catch (error) {
      console.error("Error adding to cart:", error);
      Toast.show({
        type: 'error',
        text1: 'Failed to add item to cart'
      });
      return false;
    }
  };

  // Handle quantity change with validation
  const handleQuantityChange = async (productId, change) => {
    if (!auth.currentUser) {
      Toast.show({
        type: 'info',
        text1: 'Please log in to update your cart'
      });
      navigation.navigate('Login');
      return;
    }
    
    try {
      const userId = auth.currentUser.uid;
      const cartRef = doc(db, 'carts', userId);
      const cartSnap = await getDoc(cartRef);
      
      if (!cartSnap.exists()) {
        await setDoc(cartRef, {
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          total: 0
        });
        return;
      }
      
      const cartData = cartSnap.data();
      const items = [...(cartData.items || [])];
      const itemIndex = items.findIndex(item => 
        item && item.productId === productId
      );
      
      if (itemIndex === -1) return;
      
      const updatedItems = [...items];
      const currentItem = updatedItems[itemIndex];
      const newQuantity = (currentItem.quantity || 0) + change;
      
      if (newQuantity <= 0) {
        updatedItems.splice(itemIndex, 1);
        Toast.show({
          type: 'info',
          text1: `Removed ${currentItem.name || 'item'} from cart`
        });
      } else {
        updatedItems[itemIndex] = {
          ...currentItem,
          quantity: newQuantity
        };
      }
      
      // Calculate new total
      const total = updatedItems.reduce((sum, item) => {
        return sum + ((item.price || 0) * (item.quantity || 0));
      }, 0);
      
      await updateDoc(cartRef, {
        items: updatedItems.filter(item => item), // Ensure no undefined
        updatedAt: new Date(),
        total: total
      });
      
      // Refresh cart items
      await fetchCartItems(userId);
      
    } catch (error) {
      console.error("Error updating quantity:", error);
      Toast.show({
        type: 'error',
        text1: 'Failed to update quantity'
      });
    }
  };

  // Remove item from cart
  const removeFromCart = async (productId) => {
    if (!auth.currentUser) {
      Toast.show({
        type: 'info',
        text1: 'Please log in to update your cart'
      });
      navigation.navigate('Login');
      return;
    }
    
    try {
      const userId = auth.currentUser.uid;
      const cartRef = doc(db, 'carts', userId);
      const cartSnap = await getDoc(cartRef);
      
      if (!cartSnap.exists()) return;
      
      const cartData = cartSnap.data();
      const items = [...(cartData.items || [])];
      
      // Find item name before removal for toast
      const itemToRemove = items.find(item => item.productId === productId);
      const itemName = itemToRemove ? itemToRemove.name : 'Item';
      
      const updatedItems = items.filter(item => item.productId !== productId);
      
      // Calculate new total
      const total = updatedItems.reduce((sum, item) => {
        return sum + ((item.price || 0) * (item.quantity || 0));
      }, 0);
      
      await updateDoc(cartRef, {
        items: updatedItems,
        updatedAt: new Date(),
        total: total
      });
      
      Toast.show({
        type: 'success',
        text1: `${itemName} removed from cart`
      });
      
      // Refresh cart items
      await fetchCartItems(userId);
      
    } catch (error) {
      console.error("Error removing item from cart:", error);
      Toast.show({
        type: 'error',
        text1: 'Failed to remove item from cart'
      });
    }
  };

  const toggleAddToWishlist = async (productId) => {
    if (!userLoggedIn) {
      Toast.show({
        type: 'info',
        text1: 'Please log in to add to wishlist'
      });
      navigation.navigate('Login');
      return;
    }
    
    try {
      const userId = auth.currentUser.uid;
      const isInWishlist = wishlistItems.some(item => item.productId === productId);
      
      if (isInWishlist) {
        // Remove from wishlist
        const wishlistItemId = wishlistItems.find(item => item.productId === productId).id;
        await deleteDoc(doc(db, 'users', userId, 'wishlist', wishlistItemId));
        Toast.show({
          type: 'success',
          text1: 'Removed from wishlist'
        });
      } else {
        // Add to wishlist
        await addDoc(collection(db, 'users', userId, 'wishlist'), {
          productId: productId,
          addedAt: new Date()
        });
        Toast.show({
          type: 'success',
          text1: 'Added to wishlist'
        });
      }
      
      // Refresh wishlist
      fetchWishlistItems(userId);
    } catch (error) {
      console.error("Error updating wishlist:", error);
      Toast.show({
        type: 'error',
        text1: 'Failed to update wishlist'
      });
    }
  };

  const handleProductClick = (product) => {
    if (!product || !product.id) return;
    
    try {
      const viewed = [...recentlyViewed];
      const existingIndex = viewed.findIndex(item => item && item.id === product.id);
      
      if (existingIndex !== -1) {
        viewed.splice(existingIndex, 1);
      }
      
      viewed.unshift(product);
      
      const newRecentlyViewed = viewed.slice(0, 5);
      setRecentlyViewed(newRecentlyViewed);
      AsyncStorage.setItem('recentlyViewed', JSON.stringify(newRecentlyViewed));
    } catch (error) {
      console.error("Error updating recently viewed:", error);
    }
  };

  const getTotalCartItems = () => {
    return cartItems.reduce((total, item) => total + (item.quantity || 0), 0);
  };

  const getTotalCartPrice = () => {
    return cartItems.reduce((total, item) => {
      return total + ((item.product?.price || 0) * (item.quantity || 0));
    }, 0);
  };

const handleCheckout = async () => {
  // Validate cart and address first
  if (cartItems.length === 0) {
    Toast.show({
      type: 'warning',
      text1: 'Your cart is empty'
    });
    return;
  }
  
  if (!userAddress.formatted) {
    Toast.show({
      type: 'warning',
      text1: 'Please set your delivery address first'
    });
    setIsEditingAddress(true);
    return;
  }

  // Validate payment method details
  if (selectedPaymentMethod === 'card') {
    if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name) {
      Toast.show({
        type: 'warning',
        text1: 'Please enter your complete card details'
      });
      return;
    }
    
    // Process card details
    cardDetails.last4 = cardDetails.number.slice(-4);
    // Determine card brand based on first digit
    const firstDigit = cardDetails.number.charAt(0);
    if (firstDigit === '4') cardDetails.brand = 'Visa';
    else if (firstDigit === '5') cardDetails.brand = 'Mastercard';
    else if (firstDigit === '3') cardDetails.brand = 'Amex';
    else cardDetails.brand = 'Other';
  }
  
  if (!selectedSlot) {
    Toast.show({
      type: 'warning',
      text1: 'Please select a delivery time slot'
    });
    return;
  }
  
  try {
    // Check if user is logged in
    if (!auth.currentUser) {
      Toast.show({
        type: 'info',
        text1: 'Please log in to checkout'
      });
      navigation.navigate('Login');
      return;
    }
    
    const userId = auth.currentUser.uid;
    const batch = writeBatch(db);
    
    // Group cart items by shopId
    const itemsByShop = {};
    cartItems.forEach(item => {
      const shopId = item.product?.shopId || 'default';
      if (!itemsByShop[shopId]) {
        itemsByShop[shopId] = [];
      }
      itemsByShop[shopId].push({
        productId: item.productId,
        name: item.product?.name || 'Unknown Product',
        quantity: item.quantity,
        price: item.product?.price || 0,
        imageUrl: item.product?.imageUrl,
        shopId: item.product?.shopId
      });
    });

    // Create orders for each shop
    const orderIds = [];
    const shopOrders = [];

    for (const shopId in itemsByShop) {
      const shopItems = itemsByShop[shopId];
      
      // Calculate shop-specific totals
      const shopSubtotal = shopItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const deliveryFee = 20; // Example delivery fee
      const tax = shopSubtotal * 0.08; // Example tax rate
      const shopTotal = shopSubtotal + deliveryFee + tax;
      
      // Get shop details
      let shopData = { name: 'Unknown Shop' };
      try {
        const shopRef = doc(db, 'shops', shopId);
        const shopSnap = await getDoc(shopRef);
        if (shopSnap.exists()) {
          shopData = shopSnap.data();
        }
      } catch (error) {
        console.error(`Error fetching shop ${shopId} details:`, error);
      }
      
      // Create an order reference
      const orderRef = doc(collection(db, 'orders'));
      const orderId = orderRef.id;
      orderIds.push(orderId);
      
      const orderData = {
        orderId,
        userId,
        userEmail: auth.currentUser.email,
        userName: auth.currentUser.displayName || 'Customer',
        shopId,
        shopName: shopData.name,
        items: shopItems,
        subtotal: shopSubtotal,
        deliveryFee,
        tax,
        total: shopTotal,
        status: 'pending',
        address: userAddress,
        deliverySlot: selectedSlot,
        createdAt: new Date(),
        updatedAt: new Date(),
        paymentMethod: selectedPaymentMethod,
        paymentStatus: selectedPaymentMethod === 'cash' ? 'pending' : 'paid',
        notes: orderNotes
      };

      // Process payment if using card
      if (selectedPaymentMethod === 'card') {
        // Here you would integrate with your payment processor
        // For this example, we're just storing minimal payment info
        orderData.paymentStatus = 'paid';
        orderData.paymentDetails = {
          last4: cardDetails.last4,
          brand: cardDetails.brand
        };
      }

      // Add to main orders collection
      batch.set(orderRef, orderData);

      // Add to user's orders subcollection
      const userOrderRef = doc(collection(db, 'users', userId, 'orders'), orderId);
      batch.set(userOrderRef, orderData);
      
      // Add to shop's orders subcollection (if needed)
      const shopOrderRef = doc(collection(db, 'shops', shopId, 'orders'), orderId);
      batch.set(shopOrderRef, orderData);

      shopOrders.push({
        id: orderId,
        ...orderData
      });
      
      // Update product stock and popularity
      for (const item of shopItems) {
        if (item.productId) {
          const productRef = doc(db, 'products', item.productId);
          batch.update(productRef, {
            stock: increment(-item.quantity),
            purchaseCount: increment(item.quantity),
            updatedAt: new Date()
          });
        }
      }
    }

    // Clear the user's cart
    const cartRef = doc(db, 'carts', userId);
    batch.set(cartRef, {
      items: [],
      updatedAt: new Date(),
      total: 0
    });

    // Commit all database operations
    await batch.commit();
    
    // Update local states
    setCartItems([]);
    setActiveOrders(prev => [...shopOrders, ...prev]);
    setIsCartOpen(false);
    
    // Show success message
    Toast.show({
      type: 'success',
      text1: 'Order placed successfully!',
      text2: orderIds.length > 1 
        ? `${orderIds.length} orders created` 
        : `Order #${orderIds[0].slice(0, 8)}`
    });
    
    // Navigate to Orders screen
    navigation.navigate('Orders', { 
      newOrderIds: orderIds,
      screen: 'ActiveOrders'
    });
    
  } catch (error) {
    console.error("Error placing order:", error);
    Toast.show({
      type: 'error',
      text1: 'Failed to place your order',
      text2: error.message || 'Please try again later'
    });
  }
};

  // Render the cart modal
 const renderCartModal = () => {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCartOpen}
        onRequestClose={() => setIsCartOpen(false)}
      >
        <SafeAreaView style={styles.cartModalContainer}>
          <View style={styles.cartHeader}>
            <TouchableOpacity onPress={() => setIsCartOpen(false)}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.cartTitle}>Your Cart ({getTotalCartItems()})</Text>
            <TouchableOpacity onPress={() => removeAllFromCart()}>
              <Text style={styles.clearCartText}>Clear</Text>
            </TouchableOpacity>
          </View>
          
          {cartItems.length === 0 ? (
            <View style={styles.emptyCartContainer}>
             
              <Text style={styles.emptyCartText}>Your cart is empty</Text>
              <TouchableOpacity 
                style={styles.startShoppingButton}
                onPress={() => setIsCartOpen(false)}
              >
                <Text style={styles.startShoppingButtonText}>Start Shopping</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cartContent}>
              <ScrollView style={styles.cartItemsContainer}>
                {cartItems.map((item) => (
                  <View key={item.productId} style={styles.cartItem}>
                    <Image 
                      source={{ uri: item.product?.imageUrl || 'https://via.placeholder.com/100' }}
                      style={styles.cartItemImage}
                    />
                    <View style={styles.cartItemDetails}>
                      <Text style={styles.cartItemName} numberOfLines={1}>
                        {item.product?.name || 'Product'}
                      </Text>
                      <Text style={styles.cartItemPrice}>
                        ₹{item.product?.price || 0}
                      </Text>
                    </View>
                    <View style={styles.quantityControl}>
                      <TouchableOpacity 
                        style={styles.quantityButton}
                        onPress={() => handleQuantityChange(item.productId, -1)}
                      >
                        <Text style={styles.quantityButtonText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>{item.quantity}</Text>
                      <TouchableOpacity 
                        style={styles.quantityButton}
                        onPress={() => handleQuantityChange(item.productId, 1)}
                      >
                        <Text style={styles.quantityButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                
                <View style={styles.orderNotesContainer}>
                  <Text style={styles.orderNotesLabel}>Add Notes:</Text>
                  <TextInput 
                    style={styles.orderNotesInput}
                    placeholder="Special instructions for your order"
                    value={orderNotes}
                    onChangeText={setOrderNotes}
                    multiline
                  />
                </View>
                
                <View style={styles.deliveryTimeContainer}>
                  <Text style={styles.deliveryTimeLabel}>Select Delivery Time:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {timeSlots.map((slot, index) => (
                      <TouchableOpacity 
                        key={index}
                        style={[
                          styles.timeSlotButton,
                          selectedSlot === slot && styles.selectedTimeSlotButton
                        ]}
                        onPress={() => setSelectedSlot(slot)}
                      >
                        <Text style={[
                          styles.timeSlotText,
                          selectedSlot === slot && styles.selectedTimeSlotText
                        ]}>
                          {slot}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                
                <View style={styles.paymentMethodContainer}>
                  <Text style={styles.paymentMethodLabel}>Payment Method:</Text>
                  <View style={styles.paymentOptions}>
                    <TouchableOpacity 
                      style={[
                        styles.paymentOption,
                        selectedPaymentMethod === 'cash' && styles.selectedPaymentOption
                      ]}
                      onPress={() => setSelectedPaymentMethod('cash')}
                    >
                      <MaterialCommunityIcons name="cash" size={24} color={selectedPaymentMethod === 'cash' ? "#4CAF50" : "#777"} />
                      <Text style={styles.paymentOptionText}>Cash on Delivery</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[
                        styles.paymentOption,
                        selectedPaymentMethod === 'card' && styles.selectedPaymentOption
                      ]}
                      onPress={() => setSelectedPaymentMethod('card')}
                    >
                      <MaterialCommunityIcons name="credit-card" size={24} color={selectedPaymentMethod === 'card' ? "#4CAF50" : "#777"} />
                      <Text style={styles.paymentOptionText}>Credit/Debit Card</Text>
                    </TouchableOpacity>
                  </View>
                  
                  {selectedPaymentMethod === 'card' && (
                    <View style={styles.cardDetailsContainer}>
                      <TextInput 
                        style={styles.cardInput}
                        placeholder="Card Number"
                        value={cardDetails.number}
                        onChangeText={(text) => setCardDetails({...cardDetails, number: text})}
                        keyboardType="numeric"
                        maxLength={16}
                      />
                      <View style={styles.cardRowInputs}>
                        <TextInput 
                          style={[styles.cardInput, styles.cardSmallInput]}
                          placeholder="MM/YY"
                          value={cardDetails.expiry}
                          onChangeText={(text) => setCardDetails({...cardDetails, expiry: text})}
                          keyboardType="numeric"
                          maxLength={5}
                        />
                        <TextInput 
                          style={[styles.cardInput, styles.cardSmallInput]}
                          placeholder="CVC"
                          value={cardDetails.cvc}
                          onChangeText={(text) => setCardDetails({...cardDetails, cvc: text})}
                          keyboardType="numeric"
                          maxLength={3}
                        />
                      </View>
                      <TextInput 
                        style={styles.cardInput}
                        placeholder="Name on Card"
                        value={cardDetails.name}
                        onChangeText={(text) => setCardDetails({...cardDetails, name: text})}
                      />
                    </View>
                  )}
                </View>
              </ScrollView>
              
              <View style={styles.cartSummary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal:</Text>
                  <Text style={styles.summaryValue}>₹{getTotalCartPrice().toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee:</Text>
                  <Text style={styles.summaryValue}>₹20.00</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tax (8%):</Text>
                  <Text style={styles.summaryValue}>₹{(getTotalCartPrice() * 0.08).toFixed(2)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total:</Text>
                  <Text style={styles.totalValue}>
                    ₹{(getTotalCartPrice() + 20 + (getTotalCartPrice() * 0.08)).toFixed(2)}
                  </Text>
                </View>
                
                <TouchableOpacity 
                  style={styles.checkoutButton}
                  onPress={handleCheckout}
                >
                  <Text style={styles.checkoutButtonText}>Place Order</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    );
  };

  const removeAllFromCart = async () => {
    if (!auth.currentUser) return;
    
    try {
      const userId = auth.currentUser.uid;
      await setDoc(doc(db, 'carts', userId), {
        items: [],
        updatedAt: new Date(),
        total: 0
      });
      
      setCartItems([]);
      Toast.show({
        type: 'success',
        text1: 'Cart cleared'
      });
    } catch (error) {
      console.error("Error clearing cart:", error);
      Toast.show({
        type: 'error',
        text1: 'Failed to clear cart'
      });
    }
  };
  
const { width, height } = Dimensions.get('window');

  // Main render
  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.locationContainer}>
          <Ionicons name="location-sharp" size={20} color="#FF5722" />
          <TouchableOpacity onPress={() => setIsEditingAddress(true)}>
            <Text style={styles.locationText} numberOfLines={1}>
              {userAddress.formatted 
                ? userAddress.formatted.substring(0, 25) + (userAddress.formatted.length > 25 ? '...' : '') 
                : 'Set your location'}
            </Text>
            <Text style={styles.deliveryTimeText}>Delivery in 10-15 min</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.headerActions}>
        
          
          <TouchableOpacity 
            style={styles.cartButton}
            onPress={() => setIsCartOpen(true)}
          >
            <Ionicons name="cart-outline" size={24} color="#333" />
            {cartItems.length > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{getTotalCartItems()}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Search Bar */}
      <TouchableOpacity
        style={styles.searchBar}
        onPress={() => setIsSearchModalOpen(true)}
      >
        <Ionicons name="search" size={20} color="#777" />
        <Text style={styles.searchPlaceholder}>
          Search for groceries, vegetables...
        </Text>
      </TouchableOpacity>
      
      {/* Main Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => fetchProducts()}
            colors={["#FF5722"]}
          />
        }
      >
        {/* Banners */}
        <View style={styles.bannerContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Image
              source={{uri: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1974'}}
              style={styles.bannerImage}
            />
            <Image
              source={{uri: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?q=80&w=1927'}}
              style={styles.bannerImage}
            />
            <Image
              source={{uri: 'https://images.unsplash.com/photo-1595475207225-428b62bda831?q=80&w=1969'}}
              style={styles.bannerImage}
            />
          </ScrollView>
        </View>
        
        {/* Categories */}
        <Text style={styles.sectionTitle}>Shop by Category</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
        >
          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryItem,
                selectedCategory === category.id && styles.selectedCategoryItem
              ]}
              onPress={() => fetchProducts(category.id)}
            >
              <Image
                source={{uri: category.image}}
                style={styles.categoryImage}
              />
              <Text style={styles.categoryName}>{category.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        {/* Trending Products */}
        {trendingProducts.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Trending Now</Text>
              <TouchableOpacity onPress={() => router.push('/categories')}>
                <Text style={styles.seeAllButton}>See All</Text>
              </TouchableOpacity>
            </View>
            
            <FlatList
              horizontal
              data={trendingProducts}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              renderItem={({item}) => (
                <TouchableOpacity 
                style={styles.productCard}
  onPress={() => {
    handleProductClick(item);
    router.push(`/products/${item.id}`);
  }}
                >
 

                  <View style={styles.productImageContainer}>
                    <Image
                      source={{uri: item.imageUrl || 'https://via.placeholder.com/150'}}
                      style={styles.productImage}
                    />
                    <TouchableOpacity 
                      style={styles.wishlistButton}
                      onPress={() => toggleAddToWishlist(item.id)}
                    >
                      <Ionicons 
                        name={wishlistItems.some(wishItem => wishItem.productId === item.id) ? "heart" : "heart-outline"} 
                        size={18} 
                        color={wishlistItems.some(wishItem => wishItem.productId === item.id) ? "#FF5722" : "#777"} 
                      />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.productInfo}>
                    <Text style={styles.productPrice}>₹{item.price}</Text>
                    <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.productQuantity}>{item.quantity || '1 each'}</Text>
                    
                    <TouchableOpacity 
                      style={styles.addButton}
                      onPress={() => handleAddToCart(item)}
                    >
                      <Text style={styles.addButtonText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              )}
            />
          </>
        )}
        
        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <>
            <View style={styles.activeOrdersContainer}>
              <Text style={styles.sectionTitle}>Active Orders</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {activeOrders.map((order) => (
                  <TouchableOpacity 
                    key={order.id}
                    style={styles.activeOrderCard}
                    onPress={() => {
  handleProductClick(order);
    router.push('/orders'); // <- parentheses and proper path
  }}
                  >
   
                    <View style={styles.activeOrderHeader}>
                      <Text style={styles.activeOrderId}>#{order.id.slice(0, 8)}</Text>
                      <View style={styles.activeOrderStatusContainer}>
                        <View 
                          style={[
                            styles.activeOrderStatusDot,
                            { backgroundColor: 
                              order.status === 'pending' ? '#FFC107' :
                              order.status === 'confirmed' ? '#2196F3' :
                              order.status === 'preparing' ? '#FF9800' :
                              order.status === 'out_for_delivery' ? '#8BC34A' : '#4CAF50'
                            }
                          ]} 
                        />
                        <Text style={styles.activeOrderStatusText}>
                          {order.status === 'pending' ? 'Pending' :
                           order.status === 'confirmed' ? 'Confirmed' :
                           order.status === 'preparing' ? 'Preparing' :
                           order.status === 'out_for_delivery' ? 'Out for Delivery' : 'Delivered'}
                        </Text>
                      </View>
                    </View>
                    
                    <Text style={styles.activeOrderShop}>{order.shopName}</Text>
                    <Text style={styles.activeOrderItems}>
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </Text>
                    
                    <Text style={styles.activeOrderTotal}>
                      ₹{order.total?.toFixed(2) || '0.00'}
                    </Text>
                    
                    <View style={styles.activeOrderFooter}>
                      <Ionicons name="time-outline" size={16} color="#666" />
                      <Text style={styles.activeOrderDelivery}>
                        Delivery: {order.deliverySlot}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </>
        )}
        
        {/* All Products based on filter or search */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {searchQuery ? `Results for "${searchQuery}"` : selectedCategory ? 
            `${categories.find(c => c.id === selectedCategory)?.name || 'Products'}` : 'All Products'}
          </Text>
          {selectedCategory && (
            <TouchableOpacity onPress={() => fetchProducts()}>
              <Text style={styles.clearFilterButton}>Clear Filter</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {loading ? (
          <ActivityIndicator size="large" color="#FF5722" style={styles.loader} />
        ) : filteredProducts.length > 0 ? (
          <View style={styles.productsGrid}>
            {filteredProducts.map((item) => (
              <TouchableOpacity 
                key={item.id}
            
                style={styles.productCard}
  onPress={() => {
    handleProductClick(item);
    router.push(`/products/${item.id}`);
  }}
                >
              
                <View style={styles.productImageContainer}>
                  <Image
                    source={{uri: item.imageUrl || 'https://via.placeholder.com/150'}}
                    style={styles.productImage}
                  />
                  <TouchableOpacity 
                    style={styles.wishlistButton}
                    onPress={() => toggleAddToWishlist(item.id)}
                  >
                    <Ionicons 
                      name={wishlistItems.some(wishItem => wishItem.productId === item.id) ? "heart" : "heart-outline"} 
                      size={18} 
                      color={wishlistItems.some(wishItem => wishItem.productId === item.id) ? "#FF5722" : "#777"} 
                    />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.productInfo}>
                  <Text style={styles.productPrice}>₹{item.price}</Text>
                  <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.productQuantity}>{item.quantity || '1 each'}</Text>
                  
                  <TouchableOpacity 
                    style={styles.addButton}
                    onPress={() => handleAddToCart(item)}
                  >
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.noResultsContainer}>
            
            <Text style={styles.noResultsText}>No products found</Text>
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setSelectedCategory(null);
              fetchProducts();
            }}>
              <Text style={styles.resetSearchButton}>Reset Search</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      
      {/* Address Modal */}
      <Modal
        visible={isEditingAddress}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsEditingAddress(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Delivery Address</Text>
              <TouchableOpacity onPress={() => setIsEditingAddress(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.locationToggle}>
              <TouchableOpacity 
                style={[styles.locationToggleButton, useCurrentLocation && styles.activeLocationToggle]}
                onPress={() => useCurrentLocation ? getCurrentLocation() : toggleLocationMode()}
              >
                <Ionicons name="locate" size={18} color={useCurrentLocation ? "#FFF" : "#777"} />
                <Text style={[styles.locationToggleText, useCurrentLocation && styles.activeLocationToggleText]}>
                  Use Current Location
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.locationToggleButton, !useCurrentLocation && styles.activeLocationToggle]}
                onPress={() => !useCurrentLocation ? null : toggleLocationMode()}
              >
                <Ionicons name="create-outline" size={18} color={!useCurrentLocation ? "#FFF" : "#777"} />
                <Text style={[styles.locationToggleText, !useCurrentLocation && styles.activeLocationToggleText]}>
                  Enter Manually
                </Text>
              </TouchableOpacity>
            </View>
            
            {!useCurrentLocation ? (
              <View style={styles.addressForm}>
                <TextInput 
                  style={styles.addressInput}
                  placeholder="Street Address"
                  value={userAddress.street}
                  onChangeText={(text) => handleAddressChange('street', text)}
                />
                <TextInput 
                  style={styles.addressInput}
                  placeholder="City"
                  value={userAddress.city}
                  onChangeText={(text) => handleAddressChange('city', text)}
                />
                <View style={styles.addressRowInputs}>
                  <TextInput 
                    style={[styles.addressInput, styles.addressSmallInput]}
                    placeholder="State"
                    value={userAddress.state}
                    onChangeText={(text) => handleAddressChange('state', text)}
                  />
                  <TextInput 
                    style={[styles.addressInput, styles.addressSmallInput]}
                    placeholder="Pincode"
                    value={userAddress.pincode}
                    onChangeText={(text) => handleAddressChange('pincode', text)}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            ) : (
              <View style={styles.currentLocationContainer}>
                <Text style={styles.currentAddressText}>{userAddress.formatted}</Text>
                <TouchableOpacity 
                  style={styles.refreshLocationButton}
                  onPress={getCurrentLocation}
                >
                  <Ionicons name="refresh" size={18} color="#FF5722" />
                  <Text style={styles.refreshLocationText}>Refresh Location</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <TouchableOpacity 
              style={styles.saveAddressButton}
              onPress={saveAddress}
            >
              <Text style={styles.saveAddressButtonText}>Save Address</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Search Modal */}
     <Modal
  visible={isSearchModalOpen}
  transparent={true}
  animationType="slide"
  onRequestClose={() => setIsSearchModalOpen(false)}
>
  <View style={styles.searchModalContainer}>
    <TouchableOpacity 
      style={styles.modalBackdrop}
      activeOpacity={1}
      onPress={() => setIsSearchModalOpen(false)}
    />
    
    <View style={styles.searchModalContent}>
      {/* Header with Search Input */}
      <View style={styles.searchHeader}>
        <View style={styles.searchInputContainer}>
          <View style={styles.searchIconContainer}>
            <Ionicons name="search" size={20} color="#6B7280" />
          </View>
          <TextInput 
            style={styles.searchInput}
            placeholder="Search for groceries, vegetables..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              style={styles.clearButton}
              onPress={() => setSearchQuery('')}
            >
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={() => setIsSearchModalOpen(false)}
        >
          <Ionicons name="close" size={24} color="#374151" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.searchContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Action Button */}
        {searchQuery.trim() !== '' && (
          <TouchableOpacity 
            style={styles.searchActionButton}
            onPress={handleSearch}
          >
            <View style={styles.searchActionContent}>
              <Ionicons name="search" size={16} color="#059669" />
              <Text style={styles.searchActionButtonText}>
                Search for "{searchQuery}"
              </Text>
            </View>
          </TouchableOpacity>
        )}
        
        {/* Recent Searches */}
        {searchHistory.length > 0 && searchQuery.trim() === '' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time-outline" size={18} color="#6B7280" />
              <Text style={styles.sectionTitle}>Recent Searches</Text>
            </View>
            <View style={styles.recentSearchesList}>
              {searchHistory.slice(0, 5).map((term, index) => (
                <TouchableOpacity 
                  key={index}
                  style={styles.recentSearchItem}
                  onPress={() => selectSearchTerm(term)}
                >
                  <Ionicons name="search" size={14} color="#9CA3AF" />
                  <Text style={styles.recentSearchText}>{term}</Text>
                  <Ionicons name="arrow-up-outline" size={14} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        
        {/* Recently Viewed */}
        {recentlyViewed.length > 0 && searchQuery.trim() === '' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="eye-outline" size={18} color="#6B7280" />
              <Text style={styles.sectionTitle}>Recently Viewed</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentlyViewedList}
            >
              {recentlyViewed.map((item, index) => (
               <TouchableOpacity 
  key={index}
  style={styles.recentlyViewedItem}
  onPress={() => {
    setIsSearchModalOpen(false);
    router.push(`/products/${item.id}`);
  }}
>

                  <View style={styles.recentlyViewedImageContainer}>
                    <Image 
                      source={{uri: item.imageUrl || 'https://via.placeholder.com/100'}}
                      style={styles.recentlyViewedImage}
                    />
                  </View>
                  <Text style={styles.recentlyViewedName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.recentlyViewedPrice}>₹{item.price}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        
        {/* Popular Searches */}
        {searchQuery.trim() === '' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="trending-up" size={18} color="#6B7280" />
              <Text style={styles.sectionTitle}>Popular Searches</Text>
            </View>
            <View style={styles.popularSearchTags}>
              {popularSearches.map((term, index) => (
                <TouchableOpacity 
                  key={index}
                  style={styles.popularSearchTag}
                  onPress={() => selectSearchTerm(term)}
                >
                  <Text style={styles.popularSearchTagText}>{term}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Search Suggestions (if you have any based on searchQuery) */}
        {searchQuery.trim() !== '' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bulb-outline" size={18} color="#6B7280" />
              <Text style={styles.sectionTitle}>Suggestions</Text>
            </View>
            {/* Add your search suggestions here */}
          </View>
        )}
      </ScrollView>
    </View>
  </View>
</Modal>

      
      
      {/* Cart Modal */}
      {renderCartModal()}
      
      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push('/')}
        >
          <Ionicons name="home" size={24} color="#FF5722" />
          <Text style={[styles.navText, styles.activeNavText]}>Home</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push('/categories')}
        >
          <Ionicons name="grid-outline" size={24} color="#777" />
          <Text style={styles.navText}>Categories</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push('/orders')}
        >
          <Ionicons name="receipt-outline" size={24} color="#777" />
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push('/account')}
        >
          <Ionicons name="person-outline" size={24} color="#777" />
          <Text style={styles.navText}>Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
        </SafeAreaProvider>

  )};

// Define styles
const styles = StyleSheet.create({
  container: {
 flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationText: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
    color: '#1E293B',
  },
  deliveryTimeText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 8,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 10,
    marginLeft: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  cartButton: {
    padding: 10,
    marginLeft: 10,
    position: 'relative',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  cartBadge: {
    position: 'absolute',
    right: -2,
    top: -2,
    backgroundColor: '#6366F1',
    borderRadius: 12,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchPlaceholder: {
    marginLeft: 12,
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  bannerContainer: {
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  bannerImage: {
    width: 340,
    height: 180,
    borderRadius: 20,
    marginRight: 16,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginHorizontal: 16,
    marginVertical: 16,
    color: '#1E293B',
    letterSpacing: -0.5,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: 16,
    width: 84,
    borderRadius: 20,
    padding: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  selectedCategoryItem: {
    backgroundColor: '#EEF2FF',
    borderWidth: 2,
    borderColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOpacity: 0.15,
  },
  categoryImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 13,
    color: '#1E293B',
    textAlign: 'center',
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  seeAllButton: {
    color: '#6366F1',
    fontSize: 15,
    fontWeight: '600',
  },
  productCard: {
    width: 170,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 8,
    marginVertical: 10,
    overflow: 'hidden',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  productImageContainer: {
    position: 'relative',
    height: 130,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  wishlistButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 18,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productInfo: {
    padding: 14,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  productName: {
    fontSize: 15,
    color: '#475569',
    marginTop: 6,
    fontWeight: '500',
  },
  productQuantity: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  loader: {
    marginVertical: 32,
  },
  noResultsContainer: {
    alignItems: 'center',
    padding: 32,
  },
  noResultsImage: {
    width: 220,
    height: 160,
    resizeMode: 'contain',
    marginBottom: 24,
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 12,
  },
  resetSearchButton: {
    color: '#6366F1',
    fontSize: 15,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  locationToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  locationToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 16,
    flex: 1,
    marginHorizontal: 6,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeLocationToggle: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  locationToggleText: {
    marginLeft: 8,
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  activeLocationToggleText: {
    color: '#6366F1',
    fontWeight: '600',
  },
  addressForm: {
    marginBottom: 20,
  },
  addressInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontWeight: '500',
  },
  addressRowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  addressSmallInput: {
    flex: 1,
    marginHorizontal: 6,
  },
  currentLocationContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  currentAddressText: {
    fontSize: 15,
    color: '#1E293B',
    marginBottom: 12,
    fontWeight: '500',
  },
  refreshLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshLocationText: {
    color: '#6366F1',
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '600',
  },
  saveAddressButton: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  saveAddressButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  
  cartModalContainer: {
    flex: 1,
    backgroundColor: '#FAFBFF',
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cartTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  clearCartText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyCartContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyCartImage: {
    width: 240,
    height: 240,
    resizeMode: 'contain',
    marginBottom: 32,
  },
  emptyCartText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 20,
    textAlign: 'center',
  },
  startShoppingButton: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  startShoppingButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  cartContent: {
    flex: 1,
  },
  cartItemsContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cartItemImage: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  cartItemDetails: {
    flex: 1,
    marginLeft: 16,
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  cartItemPrice: {
    fontSize: 15,
    color: '#6366F1',
    marginTop: 6,
    fontWeight: '700',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quantityButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366F1',
  },
  quantityText: {
    width: 36,
    textAlign: 'center',
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '600',
  },
  orderNotesContainer: {
    marginTop: 20,
    marginBottom: 16,
  },
  orderNotesLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  orderNotesInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    height: 100,
    textAlignVertical: 'top',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontWeight: '500',
  },
  deliveryTimeContainer: {
    marginTop: 20,
    marginBottom: 16,
  },
  deliveryTimeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  timeSlotButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    marginRight: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectedTimeSlotButton: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  timeSlotText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  selectedTimeSlotText: {
    color: '#6366F1',
    fontWeight: '600',
  },
  paymentMethodContainer: {
    marginTop: 20,
    marginBottom: 16,
  },
  paymentMethodLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  paymentOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectedPaymentOption: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  paymentOptionText: {
    fontSize: 14,
    color: '#1E293B',
    marginLeft: 12,
    fontWeight: '500',
  },
  cardDetailsContainer: {
    marginTop: 16,
  },
  cardInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontWeight: '500',
  },
  cardRowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardSmallInput: {
    flex: 1,
    marginHorizontal: 6,
  },
  cartSummary: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  checkoutButton: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  checkoutButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  activeOrdersContainer: {
    marginVertical: 20,
  },
  activeOrderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginLeft: 16,
    marginRight: 8,
    width: 280,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  activeOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeOrderId: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  activeOrderStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeOrderStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  activeOrderStatusText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  activeOrderShop: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  activeOrderItems: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12,
    fontWeight: '500',
  },
  activeOrderTotal: {
    fontSize: 17,
    fontWeight: '700',
    color: '#6366F1',
    marginBottom: 12,
  },
  activeOrderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
  },
  activeOrderDelivery: {
    fontSize: 13,
    color: '#475569',
    marginLeft: 8,
    fontWeight: '500',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    minWidth: 60,
  },
  activeNavItem: {
    backgroundColor: '#EEF2FF',
  },
  navText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    fontWeight: '600',
  },
  activeNavText: {
    color: '#6366F1',
    fontWeight: '700',
  },
  clearFilterButton: {
    color: '#6366F1',
    fontSize: 15,
    fontWeight: '600',
  },
  cartItemRemoveButton: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 8,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
 searchModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  searchModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1001,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 48,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIconContainer: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '400',
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchActionButton: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  searchActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchActionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
    marginLeft: 8,
  },
  section: {
    marginTop: 24,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 8,
  },
  recentSearchesList: {
    gap: 8,
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  recentSearchText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    marginLeft: 12,
    fontWeight: '400',
  },
  recentlyViewedList: {
    paddingRight: 20,
  },
  recentlyViewedItem: {
    width: 100,
    marginRight: 16,
    alignItems: 'center',
  },
  recentlyViewedImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recentlyViewedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  recentlyViewedName: {
    fontSize: 12,
    color: '#374151',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 16,
    marginBottom: 4,
  },
  recentlyViewedPrice: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
    textAlign: 'center',
  },
  popularSearchTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  popularSearchTag: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  popularSearchTagText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
});