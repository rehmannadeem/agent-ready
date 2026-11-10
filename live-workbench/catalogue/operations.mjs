// All operations target Admin API 2026-07. Sources: catalogue/API-SOURCES.md.
export const Q={
 preflight:`query SeedPreflight { shop { id name myshopifyDomain currencyCode plan { partnerDevelopment publicDisplayName } } currentAppInstallation { accessScopes { handle } } productsCount(limit:null){count precision} productVariantsCount(limit:null){count precision} }`,
 locations:`query SeedLocations($after:String){locations(first:50,after:$after){nodes{id}pageInfo{hasNextPage endCursor}}}`,
 publications:`query SeedPublications($after:String){publications(first:50,after:$after){nodes{id autoPublish channels(first:10){nodes{id name}pageInfo{hasNextPage}}}pageInfo{hasNextPage endCursor}}}`,
 products:`query SeedProducts($after:String){products(first:50,after:$after){nodes{id handle status tags updatedAt}pageInfo{hasNextPage endCursor}}}`,
 product:`query SeedProduct($id:ID!){product(id:$id){id handle status tags updatedAt title descriptionHtml vendor productType options{name values} variants(first:40){nodes{id sku price compareAtPrice inventoryPolicy inventoryItem{id tracked inventoryLevels(first:5){nodes{location{id}quantities(names:["available"]){name quantity}}pageInfo{hasNextPage}}}selectedOptions{name value}}pageInfo{hasNextPage}}}}`,
 byHandle:`query SeedProductByHandle($query:String!){products(first:2,query:$query){nodes{id handle status tags updatedAt}}}`,
 setProduct:`mutation SeedProductSet($input:ProductSetInput!,$identifier:ProductSetIdentifiers){productSet(input:$input,identifier:$identifier,synchronous:true){product{id handle updatedAt variants(first:50){nodes{id sku inventoryItem{id}}pageInfo{hasNextPage}}}userErrors{field message code}}}`,
 updateProduct:`mutation SeedProductUpdate($product:ProductUpdateInput!){productUpdate(product:$product){product{id status updatedAt}userErrors{field message}}}`,
 publish:`mutation SeedPublish($id:ID!,$input:[PublicationInput!]!){publishablePublish(id:$id,input:$input){userErrors{field message}}}`,
 unpublish:`mutation SeedUnpublish($id:ID!,$input:[PublicationInput!]!){publishableUnpublish(id:$id,input:$input){userErrors{field message}}}`,
 collections:`query SeedCollections($after:String){collections(first:50,after:$after,query:"handle:armans-seed-v1-*"){nodes{id handle title}pageInfo{hasNextPage endCursor}}}`,
 createCollection:`mutation SeedCollectionCreate($input:CollectionInput!){collectionCreate(input:$input){collection{id handle}userErrors{field message}}}`,
 collectionMembers:`query SeedCollectionMembers($id:ID!,$after:String){collection(id:$id){id handle products(first:250,after:$after){nodes{id}pageInfo{hasNextPage endCursor}}}}`,
 addCollectionProducts:`mutation SeedCollectionAdd($id:ID!,$productIds:[ID!]!){collectionAddProducts(id:$id,productIds:$productIds){collection{id}userErrors{field message}}}`,
 discount:`query SeedDiscount($code:String!){codeDiscountNodeByCode(code:$code){id codeDiscount{...on DiscountCodeBasic{title startsAt endsAt updatedAt}}}}`,
 createDiscount:`mutation SeedDiscountCreate($input:DiscountCodeBasicInput!){discountCodeBasicCreate(basicCodeDiscount:$input){codeDiscountNode{id codeDiscount{...on DiscountCodeBasic{title endsAt updatedAt}}}userErrors{field message code}}}`,
 updateDiscount:`mutation SeedDiscountUpdate($id:ID!,$input:DiscountCodeBasicInput!){discountCodeBasicUpdate(id:$id,basicCodeDiscount:$input){codeDiscountNode{id codeDiscount{...on DiscountCodeBasic{title endsAt updatedAt}}}userErrors{field message code}}}`,
 inventory:`query SeedInventory($id:ID!,$locationId:ID!){inventoryItem(id:$id){id tracked inventoryLevel(locationId:$locationId){id quantities(names:["available"]){name quantity}updatedAt}}}`,
 setInventory:`mutation SeedInventorySet($input:InventorySetQuantitiesInput!,$key:String!){inventorySetQuantities(input:$input) @idempotent(key:$key){inventoryAdjustmentGroup{createdAt}userErrors{field message code}}}`,
 updatePrice:`mutation SimulatePrice($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){productVariants{id price}userErrors{field message code}}}`
};
