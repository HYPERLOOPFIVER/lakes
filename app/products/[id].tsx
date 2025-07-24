import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    SafeAreaView,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { auth, db } from '../../firebaseConfig'; // Adjust path as needed

const { width } = Dimensions.get('window');

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  images?: string[];
  category: string;
  rating?: number;
  reviewCount?: number;
  shopId?: string;
  shopName?: string;
  tags?: string[];
  specifications?: Record<string, string>;
  trending?: boolean;
  discount?: number;
  originalPrice?: number;
}

interface CartItem {
  productId: string;
  quantity: number;
  price: number;
  name: string;
  image: string;
}

interface WishlistItem {
  id: string;
  productId: string;
}

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [currentCartQuantity, setCurrentCartQuantity] = useState(0);

  useEffect(() => {
    if (id) {
      fetchProductDetails();
      checkAuthState();
    }
  }, [id]);

  useEffect(() => {
    if (product && userLoggedIn) {
      fetchUserData();
    }
  }, [product, userLoggedIn]);

  useEffect(() => {
    // Update current cart quantity when cartItems change
    const cartItem = cartItems.find(item => item.productId === id);
    setCurrentCartQuantity(cartItem ? cartItem.quantity : 0);
  }, [cartItems, id]);

  const checkAuthState = () => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUserLoggedIn(!!user);
      if (user) {
        fetchCartItems(user.uid);
        fetchWishlistItems(user.uid);
      } else {
        setCartItems([]);
        setWishlistItems([]);
        setCurrentCartQuantity(0);
      }
    });
    return unsubscribe;
  };

  const fetchProductDetails = async () => {
    try {
      setLoading(true);
      const productRef = doc(db, 'products', id as string);
      const productSnap = await getDoc(productRef);
      
      if (productSnap.exists()) {
        const productData = { id: productSnap.id, ...productSnap.data() } as Product;
        setProduct(productData);
        
        // Update recently viewed
        updateRecentlyViewed(productData);
        
        // Fetch related products
        fetchRelatedProducts(productData.category, productData.id);
      } else {
        Toast.show({
          type: 'error',
          text1: 'Product not found'
        });
        router.back();
      }
    } catch (error) {
      console.error("Error fetching product:", error);
      Toast.show({
        type: 'error',
        text1: 'Failed to load product'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedProducts = async (category: string, currentProductId: string) => {
    try {
      const productsRef = collection(db, 'products');
      const q = query(productsRef, where('category', '==', category));
      const querySnapshot = await getDocs(q);
      
      const related = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Product))
        .filter(p => p.id !== currentProductId)
        .slice(0, 4);
      
      setRelatedProducts(related);
    } catch (error) {
      console.error("Error fetching related products:", error);
    }
  };

  const updateRecentlyViewed = async (productData: Product) => {
    try {
      const storedItems = await AsyncStorage.getItem('recentlyViewed');
      let recentlyViewed = storedItems ? JSON.parse(storedItems) : [];
      
      const existingIndex = recentlyViewed.findIndex((item: Product) => item.id === productData.id);
      if (existingIndex !== -1) {
        recentlyViewed.splice(existingIndex, 1);
      }
      
      recentlyViewed.unshift(productData);
      recentlyViewed = recentlyViewed.slice(0, 5);
      
      await AsyncStorage.setItem('recentlyViewed', JSON.stringify(recentlyViewed));
    } catch (error) {
      console.error("Error updating recently viewed:", error);
    }
  };

  const fetchUserData = async () => {
    if (!auth.currentUser) return;
    
    try {
      const userId = auth.currentUser.uid;
      await Promise.all([
        fetchCartItems(userId),
        fetchWishlistItems(userId)
      ]);
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const fetchCartItems = async (userId: string) => {
    try {
      const cartRef = doc(db, "carts", userId);
      const cartSnap = await getDoc(cartRef);
      
      if (cartSnap.exists()) {
        const cartData = cartSnap.data();
        const items = cartData.items || [];
        setCartItems(items);
      } else {
        setCartItems([]);
      }
    } catch (error) {
      console.error("Error fetching cart items:", error);
      setCartItems([]);
    }
  };

  const fetchWishlistItems = async (userId: string) => {
    try {
      const wishlistRef = collection(db, 'users', userId, 'wishlist');
      const wishlistSnapshot = await getDocs(wishlistRef);
      
      const wishlistData = wishlistSnapshot.docs.map(doc => ({
        id: doc.id,
        productId: doc.data().productId
      }));
      
      setWishlistItems(wishlistData);
      setIsInWishlist(wishlistData.some(item => item.productId === id));
    } catch (error) {
      console.error("Error fetching wishlist items:", error);
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;

    try {
      if (!auth.currentUser) {
        Toast.show({
          type: 'info',
          text1: 'Please log in to add items to cart'
        });
        router.push('/auth/login');
        return;
      }

      const userId = auth.currentUser.uid;
      const cartRef = doc(db, "carts", userId);
      const cartSnap = await getDoc(cartRef);
      
      let items: CartItem[] = [];
      if (cartSnap.exists()) {
        items = [...(cartSnap.data().items || [])];
      }

      const safeProduct: CartItem = {
        productId: product.id,
        quantity: quantity,
        price: product.price || 0,
        name: product.name || "Unnamed Product",
        image: product.imageUrl || ""
      };

      const existingIndex = items.findIndex(item => 
        item && item.productId === product.id
      );

      if (existingIndex >= 0) {
        items[existingIndex].quantity += quantity;
        Toast.show({
          type: 'success',
          text1: `Added ${quantity} more ${product.name} to cart`
        });
      } else {
        items.push(safeProduct);
        Toast.show({
          type: 'success',
          text1: `${product.name} added to cart`
        });
      }

      const total = items.reduce((sum, item) => {
        return sum + ((item.price || 0) * (item.quantity || 0));
      }, 0);

      // Update or create cart document
      if (cartSnap.exists()) {
        await updateDoc(cartRef, {
          items: items.filter(item => item),
          updatedAt: new Date(),
          total: total
        });
      } else {
        await setDoc(cartRef, {
          items: items.filter(item => item),
          createdAt: new Date(),
          updatedAt: new Date(),
          total: total
        });
      }

      // Refresh cart items to update UI immediately
      await fetchCartItems(userId);
      
    } catch (error) {
      console.error("Error adding to cart:", error);
      Toast.show({
        type: 'error',
        text1: 'Failed to add item to cart'
      });
    }
  };

  const toggleWishlist = async () => {
    if (!userLoggedIn) {
      Toast.show({
        type: 'info',
        text1: 'Please log in to add to wishlist'
      });
      router.push('/auth/login');
      return;
    }
    
    try {
      const userId = auth.currentUser!.uid;
      
      if (isInWishlist) {
        const wishlistItemId = wishlistItems.find(item => item.productId === id)?.id;
        if (wishlistItemId) {
          await deleteDoc(doc(db, 'users', userId, 'wishlist', wishlistItemId));
          Toast.show({
            type: 'success',
            text1: 'Removed from wishlist'
          });
        }
      } else {
        await addDoc(collection(db, 'users', userId, 'wishlist'), {
          productId: id,
          addedAt: new Date()
        });
        Toast.show({
          type: 'success',
          text1: 'Added to wishlist'
        });
      }
      
      setIsInWishlist(!isInWishlist);
      await fetchWishlistItems(userId);
    } catch (error) {
      console.error("Error updating wishlist:", error);
      Toast.show({
        type: 'error',
        text1: 'Failed to update wishlist'
      });
    }
  };

  const handleShare = async () => {
    if (!product) return;
    
    try {
      await Share.share({
        message: `Check out ${product.name} - ₹${product.price}\n\nGet it now!`,
        title: product.name
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const renderImageCarousel = () => {
    const images = product?.images && product.images.length > 0 
      ? product.images 
      : product?.imageUrl ? [product.imageUrl] : [];

    if (images.length === 0) return null;

    return (
      <View style={styles.imageContainer}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / width);
            setCurrentImageIndex(index);
          }}
        >
          {images.map((image, index) => (
            <Image
              key={index}
              source={{ uri: image }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
        
        {images.length > 1 && (
          <View style={styles.imageIndicators}>
            {images.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.indicator,
                  currentImageIndex === index && styles.activeIndicator
                ]}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderRelatedProducts = () => {
    if (relatedProducts.length === 0) return null;

    return (
      <View style={styles.relatedSection}>
        <Text style={styles.sectionTitle}>Related Products</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {relatedProducts.map((relatedProduct) => (
            <TouchableOpacity
              key={relatedProduct.id}
              style={styles.relatedProductCard}
              onPress={() => router.push(`/products/${relatedProduct.id}`)}
            >
              <Image
                source={{ uri: relatedProduct.imageUrl }}
                style={styles.relatedProductImage}
              />
              <Text style={styles.relatedProductName} numberOfLines={2}>
                {relatedProduct.name}
              </Text>
              <Text style={styles.relatedProductPrice}>
                ₹{relatedProduct.price}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading product...</Text>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Product not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const discountedPrice = product.discount && product.originalPrice 
    ? product.originalPrice - (product.originalPrice * product.discount / 100)
    : product.price;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Ionicons name="share-outline" size={24} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleWishlist} style={styles.headerButton}>
            <Ionicons 
              name={isInWishlist ? "heart" : "heart-outline"} 
              size={24} 
              color={isInWishlist ? "#FF6B6B" : "#000"} 
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Product Images */}
        {renderImageCarousel()}

        {/* Product Info */}
        <View style={styles.productInfo}>
          <View style={styles.titleSection}>
            <Text style={styles.productName}>{product.name}</Text>
            {product.trending && (
              <View style={styles.trendingBadge}>
                <Text style={styles.trendingText}>Trending</Text>
              </View>
            )}
          </View>

          {/* Rating */}
          {product.rating && (
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.ratingText}>
                {product.rating} ({product.reviewCount || 0} reviews)
              </Text>
            </View>
          )}

          {/* Price */}
          <View style={styles.priceContainer}>
            <Text style={styles.currentPrice}>₹{discountedPrice}</Text>
            {product.discount && product.originalPrice && (
              <>
                <Text style={styles.originalPrice}>₹{product.originalPrice}</Text>
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>{product.discount}% OFF</Text>
                </View>
              </>
            )}
          </View>

          {/* Quantity Selector */}
          <View style={styles.quantitySection}>
            <Text style={styles.quantityLabel}>Quantity:</Text>
            <View style={styles.quantityControls}>
              <TouchableOpacity 
                style={[styles.quantityButton, quantity <= 1 && styles.disabledButton]}
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                <Text style={styles.quantityButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity 
                style={styles.quantityButton}
                onPress={() => setQuantity(quantity + 1)}
              >
                <Text style={styles.quantityButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Description */}
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>

          {/* Specifications */}
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <View style={styles.specificationsSection}>
              <Text style={styles.sectionTitle}>Specifications</Text>
              {Object.entries(product.specifications).map(([key, value]) => (
                <View key={key} style={styles.specificationRow}>
                  <Text style={styles.specificationKey}>{key}:</Text>
                  <Text style={styles.specificationValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.tagsContainer}>
                {product.tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Related Products */}
          {renderRelatedProducts()}
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {currentCartQuantity > 0 && (
          <Text style={styles.cartQuantityText}>
            {currentCartQuantity} in cart
          </Text>
        )}
        <TouchableOpacity 
          style={styles.addToCartButton}
          onPress={handleAddToCart}
        >
          <MaterialCommunityIcons name="cart-plus" size={20} color="#fff" />
          <Text style={styles.addToCartText}>
            {currentCartQuantity > 0 ? 'Add More to Cart' : 'Add to Cart'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerActions: {
    flexDirection: 'row',
  },
  headerButton: {
    marginLeft: 16,
  },
  content: {
    flex: 1,
  },
  imageContainer: {
    position: 'relative',
  },
  productImage: {
    width: width,
    height: width * 0.8,
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 4,
  },
  activeIndicator: {
    backgroundColor: '#fff',
  },
  productInfo: {
    padding: 20,
  },
  titleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 12,
  },
  trendingBadge: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trendingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ratingText: {
    marginLeft: 4,
    fontSize: 14,
    color: '#666',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  currentPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginRight: 12,
  },
  originalPrice: {
    fontSize: 18,
    color: '#999',
    textDecorationLine: 'line-through',
    marginRight: 8,
  },
  discountBadge: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  quantitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 16,
    color: '#333',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  quantityButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  disabledButton: {
    opacity: 0.5,
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  quantityText: {
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  descriptionSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#666',
  },
  specificationsSection: {
    marginBottom: 24,
  },
  specificationRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  specificationKey: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  specificationValue: {
    flex: 2,
    fontSize: 14,
    color: '#666',
  },
  tagsSection: {
    marginBottom: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 12,
    color: '#666',
  },
  relatedSection: {
    marginTop: 24,
  },
  relatedProductCard: {
    width: 120,
    marginRight: 16,
  },
  relatedProductImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
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
  relatedProductName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  relatedProductPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  bottomActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  cartQuantityText: {
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 12,
    color: '#666',
  },
  addToCartButton: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addToCartText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});