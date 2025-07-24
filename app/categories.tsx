import { Feather, FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Image, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../firebaseConfig';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 45) / 2; // 15 padding on each side + 15 gap between cards

// Hardcoded categories
const categories = [
  {
    id: 'all',
    name: 'All',
    icon: <Feather name="grid" size={20} color="#333" />,
  },
  {
    id: 'electronics',
    name: 'Electronics',
    icon: <Ionicons name="laptop-outline" size={20} color="#333" />,
  },
  {
    id: 'groceries',
    name: 'Groceries',
    icon: <MaterialCommunityIcons name="food-outline" size={20} color="#333" />,
  },
  {
    id: 'stationary',
    name: 'Stationary',
    icon: <MaterialCommunityIcons name="pen" size={20} color="#333" />,
  },
  {
    id: 'fruitandvegetable',
    name: 'Fruits & Veggies',
    icon: <FontAwesome5 name="apple-alt" size={18} color="#333" />,
  }
];

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl?: string;
}

export default function CategoriesScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'products'));
        const productsData: Product[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          productsData.push({
            id: doc.id,
            name: data.name || 'Unnamed Product',
            price: data.price || 0,
            category: data.category || 'uncategorized',
            imageUrl: data.imageUrl
          });
        });

        setProducts(productsData);
      } catch (error) {
        console.error("Error fetching products: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const filteredProducts = selectedCategory === 'all' 
    ? products 
    : products.filter(product => product.category === selectedCategory);

  const getCategoryCount = (categoryId: string) => {
    if (categoryId === 'all') return products.length;
    return products.filter(p => p.category === categoryId).length;
  };

  const renderCategoryItem = ({ item, index }) => (
    <TouchableOpacity
      style={[
        styles.categoryItem,
        selectedCategory === item.id && styles.selectedCategory,
        index === 0 && styles.firstCategoryItem
      ]}
      onPress={() => setSelectedCategory(item.id)}
      activeOpacity={0.8}
    >
      <View style={styles.categoryIcon}>{item.icon}</View>
      <Text style={[
        styles.categoryName,
        selectedCategory === item.id && styles.selectedCategoryText
      ]} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={[
        styles.categoryCount,
        selectedCategory === item.id && styles.selectedCategoryCount
      ]}>
        ({getCategoryCount(item.id)})
      </Text>
    </TouchableOpacity>
  );

  const renderProductItem = ({ item }) => (
    <Link href={`/products/${item.id}`} asChild>
      <TouchableOpacity style={styles.productItem} activeOpacity={0.8}>
        <View style={styles.productImageContainer}>
          {item.imageUrl ? (
            <Image 
              source={{ uri: item.imageUrl }} 
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.productImage, styles.noImage]}>
              <Feather name="image" size={32} color="#bbb" />
            </View>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.productPrice}>₹{item.price.toFixed(2)}</Text>
          <View style={styles.categoryBadge}>
            <Text style={styles.productCategory} numberOfLines={1}>
              {item.category}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Link>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196f3" />
        <Text style={styles.loadingText}>Loading products...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Categories</Text>
      </View>
      
      <View style={styles.categorySection}>
        <FlatList
          horizontal
          data={categories}
          renderItem={renderCategoryItem}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        />
      </View>

      <View style={styles.productsSection}>
        <Text style={styles.subHeader}>
          {categories.find(c => c.id === selectedCategory)?.name} Products ({filteredProducts.length})
        </Text>

        {filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="package" size={50} color="#ccc" />
            <Text style={styles.emptyText}>No products found in this category</Text>
          </View>
        ) : (
          <FlatList
            data={filteredProducts}
            renderItem={renderProductItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.productRow}
            contentContainerStyle={styles.productList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
        <View style={styles.bottomNav}>
              <TouchableOpacity 
                style={styles.navItem}
                onPress={() => router.push('/home')}
              >
                <Ionicons name="home" size={24} color="#777" />
                <Text style={[styles.navText, styles.activeNavText]}>Home</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.navItem}
                onPress={() => router.push('/categories')}
              >
                <Ionicons name="grid-outline" size={24} color="#FF5722" />
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  headerContainer: {
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 5,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  categorySection: {
    paddingVertical: 15,
  },
  categoryList: {
    paddingHorizontal: 15,
  },
  categoryItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    minWidth: 85,
    minHeight: 85,
  },
  firstCategoryItem: {
    marginLeft: 0,
  },
  selectedCategory: {
    backgroundColor: '#2196f3',
    shadowColor: '#2196f3',
    shadowOpacity: 0.3,
  },
  categoryIcon: {
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    color: '#333',
    lineHeight: 13,
  },
  selectedCategoryText: {
    color: '#fff',
  },
  categoryCount: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  selectedCategoryCount: {
    color: '#e3f2fd',
  },
  productsSection: {
    flex: 1,
    paddingHorizontal: 15,
  },
  subHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 15,
    textAlign: 'center',
  },
  productList: {
    paddingBottom: 20,
  },
  productRow: {
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  productItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: CARD_WIDTH,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  productImageContainer: {
    width: '100%',
    height: 130,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  noImage: {
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    lineHeight: 18,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196f3',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
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
  productCategory: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
});