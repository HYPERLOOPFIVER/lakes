import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from 'expo-location';
import { doc, updateDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { db } from "../firebaseConfig";

export default function LocationSelectionScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState({
    street: "",
    city: "",
    state: "",
    pincode: "",
    landmark: "",
    addressType: "Home"
  });

  const navigation = useNavigation();
  const route = useRoute();
  const { userId, userName } = route.params;

  // Popular cities for quick selection
  const popularCities = [
    { id: 1, name: "Mumbai", state: "Maharashtra", icon: "🏙️" },
    { id: 2, name: "Delhi", state: "Delhi", icon: "🏛️" },
    { id: 3, name: "Bangalore", state: "Karnataka", icon: "🌆" },
    { id: 4, name: "Hyderabad", state: "Telangana", icon: "🏘️" },
    { id: 5, name: "Chennai", state: "Tamil Nadu", icon: "🏖️" },
    { id: 6, name: "Kolkata", state: "West Bengal", icon: "🏪" },
    { id: 7, name: "Pune", state: "Maharashtra", icon: "🏫" },
    { id: 8, name: "Ahmedabad", state: "Gujarat", icon: "🕌" }
  ];

  const getCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      // Request location permission
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please enable location access to use this feature'
        );
        setLocationLoading(false);
        return;
      }

      // Get current location
      let location = await Location.getCurrentPositionAsync({});
      let address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address[0]) {
        const currentAddr = address[0];
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: `${currentAddr.street || ''} ${currentAddr.city || ''}, ${currentAddr.region || ''} ${currentAddr.postalCode || ''}`.trim(),
          city: currentAddr.city || '',
          state: currentAddr.region || '',
          pincode: currentAddr.postalCode || ''
        });
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to get current location. Please try again.');
      console.error('Location error:', error);
    } finally {
      setLocationLoading(false);
    }
  };

  const selectLocation = (location) => {
    setSelectedLocation(location);
  };

  const handleAddressSubmit = () => {
    if (!addressForm.street || !addressForm.city || !addressForm.state || !addressForm.pincode) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    const newAddress = {
      id: Date.now(),
      ...addressForm,
      fullAddress: `${addressForm.street}, ${addressForm.city}, ${addressForm.state} - ${addressForm.pincode}${addressForm.landmark ? ', Near ' + addressForm.landmark : ''}`
    };

    setSavedAddresses(prev => [...prev, newAddress]);
    setSelectedLocation(newAddress);
    setShowAddressForm(false);
    setAddressForm({
      street: "",
      city: "",
      state: "",
      pincode: "",
      landmark: "",
      addressType: "Home"
    });
  };

  const saveLocationAndProceed = async () => {
    if (!selectedLocation) {
      Alert.alert("Error", "Please select a location first");
      return;
    }

    setLoading(true);
    try {
      // Update user document with location data
      await updateDoc(doc(db, "users", userId), {
        profileCompleted: true,
        locationSelected: true,
        selectedLocation: selectedLocation,
        updatedAt: new Date().toISOString()
      });

      Alert.alert(
        "Welcome to ShopEase!",
        `Hi ${userName}, your location has been saved successfully. You can now start shopping!`,
        [
          {
            text: "Start Shopping",
            onPress: () => navigation.navigate('Home') // Navigate to main app
          }
        ]
      );

    } catch (error) {
      Alert.alert("Error", "Failed to save location. Please try again.");
      console.error('Location save error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderPopularCity = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.cityCard,
        selectedLocation?.id === item.id && styles.selectedCityCard
      ]}
      onPress={() => selectLocation(item)}
    >
      <Text style={styles.cityIcon}>{item.icon}</Text>
      <Text style={styles.cityName}>{item.name}</Text>
      <Text style={styles.stateName}>{item.state}</Text>
    </TouchableOpacity>
  );

  const renderSavedAddress = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.addressCard,
        selectedLocation?.id === item.id && styles.selectedAddressCard
      ]}
      onPress={() => selectLocation(item)}
    >
      <View style={styles.addressHeader}>
        <Ionicons 
          name={item.addressType === 'Home' ? 'home' : item.addressType === 'Work' ? 'briefcase' : 'location'} 
          size={20} 
          color="#667eea" 
        />
        <Text style={styles.addressType}>{item.addressType}</Text>
      </View>
      <Text style={styles.addressText}>{item.fullAddress}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Select Your Location</Text>
            <Text style={styles.headerSubtitle}>
              Hi {userName}, please choose your delivery location
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Current Location</Text>
          <TouchableOpacity
            style={styles.currentLocationButton}
            onPress={getCurrentLocation}
            disabled={locationLoading}
          >
            <View style={styles.currentLocationContent}>
              <Ionicons name="location" size={24} color="#667eea" />
              <View style={styles.currentLocationText}>
                {locationLoading ? (
                  <ActivityIndicator size="small" color="#667eea" />
                ) : currentLocation ? (
                  <>
                    <Text style={styles.currentLocationTitle}>Current Location</Text>
                    <Text style={styles.currentLocationAddress}>{currentLocation.address}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.currentLocationTitle}>Use Current Location</Text>
                    <Text style={styles.currentLocationSubtitle}>Enable location to detect automatically</Text>
                  </>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#667eea" />
          </TouchableOpacity>

          {currentLocation && (
            <TouchableOpacity
              style={[
                styles.selectCurrentButton,
                selectedLocation?.latitude === currentLocation.latitude && styles.selectedButton
              ]}
              onPress={() => selectLocation(currentLocation)}
            >
              <Text style={[
                styles.selectCurrentButtonText,
                selectedLocation?.latitude === currentLocation.latitude && styles.selectedButtonText
              ]}>
                {selectedLocation?.latitude === currentLocation.latitude ? 'Selected' : 'Select This Location'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Popular Cities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏙️ Popular Cities</Text>
          <FlatList
            data={popularCities}
            renderItem={renderPopularCity}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            columnWrapperStyle={styles.cityRow}
            scrollEnabled={false}
          />
        </View>

        {/* Saved Addresses */}
        {savedAddresses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏠 Saved Addresses</Text>
            <FlatList
              data={savedAddresses}
              renderItem={renderSavedAddress}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* Add New Address */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.addAddressButton}
            onPress={() => setShowAddressForm(!showAddressForm)}
          >
            <Ionicons name="add-circle" size={24} color="#667eea" />
            <Text style={styles.addAddressText}>Add New Address</Text>
          </TouchableOpacity>

          {showAddressForm && (
            <View style={styles.addressForm}>
              <Text style={styles.formTitle}>Add New Address</Text>
              
              <View style={styles.addressTypeContainer}>
                {['Home', 'Work', 'Other'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.addressTypeButton,
                      addressForm.addressType === type && styles.selectedAddressType
                    ]}
                    onPress={() => setAddressForm(prev => ({ ...prev, addressType: type }))}
                  >
                    <Text style={[
                      styles.addressTypeButtonText,
                      addressForm.addressType === type && styles.selectedAddressTypeText
                    ]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.formInput}
                placeholder="Street Address *"
                value={addressForm.street}
                onChangeText={(text) => setAddressForm(prev => ({ ...prev, street: text }))}
              />
              
              <View style={styles.formRow}>
                <TextInput
                  style={[styles.formInput, styles.halfInput]}
                  placeholder="City *"
                  value={addressForm.city}
                  onChangeText={(text) => setAddressForm(prev => ({ ...prev, city: text }))}
                />
                <TextInput
                  style={[styles.formInput, styles.halfInput]}
                  placeholder="State *"
                  value={addressForm.state}
                  onChangeText={(text) => setAddressForm(prev => ({ ...prev, state: text }))}
                />
              </View>
              
              <View style={styles.formRow}>
                <TextInput
                  style={[styles.formInput, styles.halfInput]}
                  placeholder="Pincode *"
                  value={addressForm.pincode}
                  onChangeText={(text) => setAddressForm(prev => ({ ...prev, pincode: text }))}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.formInput, styles.halfInput]}
                  placeholder="Landmark"
                  value={addressForm.landmark}
                  onChangeText={(text) => setAddressForm(prev => ({ ...prev, landmark: text }))}
                />
              </View>

              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowAddressForm(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleAddressSubmit}
                >
                  <Text style={styles.saveButtonText}>Save Address</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Continue Button */}
      {selectedLocation && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.continueButton, loading && styles.disabledButton]}
            onPress={saveLocationAndProceed}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.continueButtonText}>Continue Shopping</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 0 : 20,
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backButton: {
    marginRight: 16,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  currentLocationButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 8,
  },
  currentLocationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  currentLocationText: {
    marginLeft: 12,
    flex: 1,
  },
  currentLocationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  currentLocationSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  currentLocationAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  selectCurrentButton: {
    backgroundColor: '#667eea',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  selectedButton: {
    backgroundColor: '#28a745',
  },
  selectCurrentButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedButtonText: {
    color: '#fff',
  },
  cityRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cityCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 0.48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCityCard: {
    borderColor: '#667eea',
    backgroundColor: '#f0f4ff',
  },
  cityIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  cityName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  stateName: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  addressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedAddressCard: {
    borderColor: '#667eea',
    backgroundColor: '#f0f4ff',
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  addressType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  addressText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  addAddressButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#667eea',
    borderStyle: 'dashed',
  },
  addAddressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
    marginLeft: 8,
  },
  addressForm: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  addressTypeContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  addressTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  selectedAddressType: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  addressTypeButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  selectedAddressTypeText: {
    color: '#fff',
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    flex: 0.48,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelButton: {
    flex: 0.48,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 0.48,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#667eea',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  continueButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  disabledButton: {
    opacity: 0.7,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
});